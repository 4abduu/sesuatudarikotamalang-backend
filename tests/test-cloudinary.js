// test-cloudinary.js
require('dotenv/config');
// Baris ke-3
const { uploadBuffer } = require('../dist/lib/cloudinary');
const { v2: cloudinary } = require('cloudinary');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

(async () => {
  const result = await uploadBuffer(png, {
    filename: 'cloudinary-connection-test.png',
    mimetype: 'image/png',
  });

  if (!result.secure_url || !result.public_id) {
    throw new Error('Respons Cloudinary tidak lengkap');
  }

  console.log('Cloudinary upload: OK');
  console.log('Secure URL tersedia: OK');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  await cloudinary.uploader.destroy(result.public_id, {
    resource_type: result.resource_type || 'image',
  });

  console.log('Cloudinary cleanup: OK');
})().catch((err) => {
  console.error('Cloudinary test gagal:', err.status || err.message);
  process.exit(1);
});