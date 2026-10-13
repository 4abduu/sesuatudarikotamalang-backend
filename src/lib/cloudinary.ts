import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

const folder = process.env.CLOUDINARY_FOLDER || "sesuatu-darikota-malang";

function ensureConfigured() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error: any = new Error("Cloudinary belum dikonfigurasi");
    error.status = 503;
    throw error;
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export function uploadBuffer(
  buffer: Buffer,
  options: { filename: string; mimetype: string }
): Promise<UploadApiResponse> {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        public_id: options.filename.replace(/\.[^.]+$/, ""),
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          const uploadError: any = new Error(error?.message || "Upload Cloudinary gagal");
          uploadError.status = 502;
          reject(uploadError);
          return;
        }
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

export default { uploadBuffer };
