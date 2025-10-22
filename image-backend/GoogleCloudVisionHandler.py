from google.cloud import vision_v1
import requests
import tempfile
import os
from typing import Optional, Dict, Any, List
import logging
from urllib.parse import urlparse
import magic

class GoogleCloudVisionHandler:
    """
    Handler for interacting with Google Cloud Vision API with support for PDFs and images.
    """
    
    def __init__(self, google_credentials_path: str):
        """
        Initialize the handler with Google Cloud credentials.
        """
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = google_credentials_path
        self.vision_client = vision_v1.ImageAnnotatorClient()
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.INFO)
        
        self.SUPPORTED_MIME_TYPES = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/bmp',
            'image/webp',
            'image/tiff'
        ]
        self.BATCH_SIZE = 5  # Google Vision API's limit per request

    async def extract_text(
        self, 
        file_path: str,
        language_hints: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Extract text from file using Google Cloud Vision API.
        """
        try:
            with open(file_path, "rb") as file:
                content = file.read()
            
            mime_type = self.get_file_type(file_path)
            
            if mime_type == 'application/pdf':
                # Get total page count
                import PyPDF2
                with open(file_path, 'rb') as pdf_file:
                    pdf_reader = PyPDF2.PdfReader(pdf_file)
                    total_pages = len(pdf_reader.pages)
                    self.logger.info(f"PDF total pages: {total_pages}")

                pages_text = []
                
                # Process PDF in batches
                for start_idx in range(0, total_pages, self.BATCH_SIZE):
                    # Calculate page numbers for this batch
                    page_numbers = []
                    for i in range(start_idx, min(start_idx + self.BATCH_SIZE, total_pages)):
                        page_numbers.append(i + 1)  # Convert to 1-based page numbers
                    
                    self.logger.info(f"Processing pages: {page_numbers}")

                    # Configure the request
                    input_config = {"mime_type": mime_type, "content": content}
                    features = [{"type_": vision_v1.Feature.Type.DOCUMENT_TEXT_DETECTION}]
                    
                    # Create request with specific pages
                    request = {
                        "input_config": input_config,
                        "features": features,
                        "pages": page_numbers
                    }

                    if language_hints:
                        request["image_context"] = {"language_hints": language_hints}

                    # Process the batch
                    response = self.vision_client.batch_annotate_files(requests=[request])
                    
                    # Extract text from response
                    for image_response in response.responses[0].responses:
                        annotation = image_response.full_text_annotation
                        if not annotation:
                            continue
                            
                        # Extract text blocks with confidence
                        text_blocks = []
                        for page in annotation.pages:
                            for block in page.blocks:
                                block_text = ""
                                confidence = block.confidence
                                
                                for paragraph in block.paragraphs:
                                    for word in paragraph.words:
                                        word_text = "".join(
                                            [symbol.text for symbol in word.symbols]
                                        )
                                        block_text += word_text + " "
                                
                                text_blocks.append({
                                    "text": block_text.strip(),
                                    "confidence": confidence
                                })
                        
                        # Use the page number from the current batch
                        current_page = page_numbers[len(pages_text) % len(page_numbers)]
                        pages_text.append({
                            "full_text": annotation.text,
                            "text_blocks": text_blocks,
                            "page_number": current_page
                        })

                # Sort pages by page number to ensure correct order
                pages_text.sort(key=lambda x: x["page_number"])
                
                self.logger.info(f"Successfully processed {len(pages_text)} of {total_pages} pages")

                return {
                    "file_type": "pdf",
                    "pages": pages_text,
                    "total_pages": total_pages,
                    "processed_pages": len(pages_text)
                }
            else:  # Handle as image
                image = vision_v1.Image(content=content)
                
                # Configure image context if language hints provided
                image_context = None
                if language_hints:
                    image_context = vision_v1.ImageContext(
                        language_hints=language_hints
                    )
                
                # Perform OCR
                response = self.vision_client.text_detection(
                    image=image,
                    image_context=image_context
                )
                
                if response.error.message:
                    raise Exception(
                        f"Error from Google Cloud Vision API: {response.error.message}"
                    )
                
                # Extract full text and individual text blocks with confidence
                full_text = response.text_annotations[0].description if response.text_annotations else ""
                
                text_blocks = []
                for page in response.full_text_annotation.pages:
                    for block in page.blocks:
                        block_text = ""
                        confidence = block.confidence
                        
                        for paragraph in block.paragraphs:
                            for word in paragraph.words:
                                word_text = "".join(
                                    [symbol.text for symbol in word.symbols]
                                )
                                block_text += word_text + " "
                        
                        text_blocks.append({
                            "text": block_text.strip(),
                            "confidence": confidence
                        })

                # Create a single page result matching PDF format
                pages_text = [{
                    "full_text": full_text,
                    "text_blocks": text_blocks,
                    "page_number": 1
                }]
                
                return {
                    "file_type": "image",
                    "pages": pages_text,
                    "total_pages": 1,
                    "processed_pages": 1
                }
        except Exception as e:
            self.logger.error(f"Error extracting text: {str(e)}")
            raise

    def get_file_type(self, file_path: str) -> str:
        """
        Determine file type using magic numbers.
        """
        try:
            mime = magic.Magic(mime=True)
            file_type = mime.from_file(file_path)
            
            if file_type not in self.SUPPORTED_MIME_TYPES:
                raise ValueError(f"Unsupported file type: {file_type}")
                
            return file_type
            
        except Exception as e:
            self.logger.error(f"Error determining file type: {str(e)}")
            raise

    async def download_from_url(self, url: str) -> str:
        """
        Download file from URL to temporary local storage.
        """
        try:
            # Validate URL
            parsed_url = urlparse(url)
            if not parsed_url.scheme == 'https':
                raise ValueError("Only HTTPS URLs are supported")

            # Get file extension from URL or default to .tmp
            ext = os.path.splitext(parsed_url.path)[1] or '.tmp'
            
            # Create temporary file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            temp_path = temp_file.name

            # Download from URL
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()

            # Write content to temporary file
            with open(temp_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            self.logger.info(f"Successfully downloaded file from {url}")
            return temp_path
            
        except Exception as e:
            self.logger.error(f"Error downloading file: {str(e)}")
            raise

    def cleanup_temp_file(self, file_path: str):
        """
        Remove temporary file.
        """
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
                self.logger.info(f"Successfully removed temporary file {file_path}")
        except Exception as e:
            self.logger.error(f"Error removing temporary file: {str(e)}")

    async def process_file_url(
        self,
        file_url: str,
        language_hints: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Process file (PDF or image) from URL using Google Cloud Vision API.
        """
        temp_path = None
        try:
            # Download from URL
            temp_path = await self.download_from_url(file_url)
            
            # Extract text
            result = await self.extract_text(temp_path, language_hints)
            return result
                
        except Exception as e:
            self.logger.error(f"Error processing file URL: {str(e)}")
            raise
            
        finally:
            # Clean up temporary file
            if temp_path:
                self.cleanup_temp_file(temp_path)