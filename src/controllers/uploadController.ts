import { Request, Response, NextFunction } from "express";
import { uploadBuffer } from "../lib/cloudinary";

// Controller untuk menangani upload file tunggal atau jamak
export const uploadSingle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Tidak ada file yang diunggah" });
    }

    const uploaded = await uploadBuffer(req.file.buffer, {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    res.json({
      message: "Upload file berhasil",
      url: uploaded.secure_url,
      filename: uploaded.public_id,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (err) {
    next(err);
  }
};

export const uploadMultiple = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "Tidak ada file yang diunggah" });
    }

    const uploadedFiles = await Promise.all(files.map(async (file) => {
      const uploaded = await uploadBuffer(file.buffer, {
        filename: file.originalname,
        mimetype: file.mimetype,
      });
      return {
        url: uploaded.secure_url,
        filename: uploaded.public_id,
        size: file.size,
        mimetype: file.mimetype,
      };
    }));

    res.json({
      message: `${uploadedFiles.length} file berhasil diunggah`,
      files: uploadedFiles,
      urls: uploadedFiles.map((f) => f.url),
    });
  } catch (err) {
    next(err);
  }
};

export default {
  uploadSingle,
  uploadMultiple,
};
