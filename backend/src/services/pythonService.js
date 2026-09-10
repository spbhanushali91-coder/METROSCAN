const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:5001';

/**
 * Sends the image at imagePath to the Python OCR/rules microservice
 * and returns its compliance analysis JSON.
 */
async function analyzeImage(imagePath) {
  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath));

  try {
    const response = await axios.post(
      `${OCR_SERVICE_URL}/analyze`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000
      }
    );

    return response.data;

  } catch (error) {
    console.error('========== OCR SERVICE ERROR ==========');

    console.error('Status:', error.response?.status);
    console.error('Response:', error.response?.data);
    console.error('Message:', error.message);

    console.error('========================================');

    throw error;
  }
}



module.exports = {
  analyzeImage
};
