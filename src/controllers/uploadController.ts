import { Request, Response, NextFunction } from "express";
import { uploadBuffer, deleteFromCloudinary } from "../lib/cloudinary";
import prisma from "../lib/prisma";

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

    // Catat ke uploaded_files; bila gagal, kompensasi: hapus dari Cloudinary
    try {
      await prisma.uploadedFile.create({
        data: {
          publicId: uploaded.public_id,
          resourceType: uploaded.resource_type || "image",
          url: uploaded.secure_url,
          mimetype: req.file.mimetype,
          size: req.file.size,
          uploadedById: req.user?.id ?? null,
        },
      });
    } catch (dbErr) {
      // Kompensasi: hapus dari Cloudinary (best effort) agar tidak ada file tak terlacak
      try {
        await deleteFromCloudinary(uploaded.public_id, uploaded.resource_type || "image");
      } catch {
        // diabaikan
      }
      throw dbErr; // teruskan error pencatatan ke client (500)
    }

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

    const uploadedFiles: Array<{
      url: string;
      filename: string;
      size: number;
      mimetype: string;
      publicId: string;
      resourceType: string;
    }> = [];

    for (const file of files) {
      let uploaded;
      try {
        uploaded = await uploadBuffer(file.buffer, {
          filename: file.originalname,
          mimetype: file.mimetype,
        });
      } catch (err) {
        // Rollback semua yang sudah terunggah sejauh ini
        for (const done of uploadedFiles) {
          try { await deleteFromCloudinary(done.publicId, done.resourceType); } catch {}
        }
        throw err;
      }

      // Catat ke uploaded_files; bila gagal, rollback semua termasuk yang baru
      try {
        await prisma.uploadedFile.create({
          data: {
            publicId: uploaded.public_id,
            resourceType: uploaded.resource_type || "image",
            url: uploaded.secure_url,
            mimetype: file.mimetype,
            size: file.size,
            uploadedById: req.user?.id ?? null,
          },
        });
      } catch (dbErr) {
        // Rollback: hapus yang baru + semua sebelumnya
        try { await deleteFromCloudinary(uploaded.public_id, uploaded.resource_type || "image"); } catch {}
        for (const done of uploadedFiles) {
          try { await deleteFromCloudinary(done.publicId, done.resourceType); } catch {}
        }
        throw dbErr;
      }

      uploadedFiles.push({
        url: uploaded.secure_url,
        filename: uploaded.public_id,
        size: file.size,
        mimetype: file.mimetype,
        publicId: uploaded.public_id,
        resourceType: uploaded.resource_type || "image",
      });
    }

    res.json({
      message: `${uploadedFiles.length} file berhasil diunggah`,
      files: uploadedFiles.map(({ url, filename, size, mimetype }) => ({ url, filename, size, mimetype })),
      urls: uploadedFiles.map((f) => f.url),
    });
  } catch (err) {
    next(err);
  }
};

export const listMyUploads = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Dikerjakan di Langkah 7 (dal/uploadedFiles.ts)
    const { listMyUploads: listMyUploadsDAL } = await import("../dal/uploadedFiles");
    const files = await listMyUploadsDAL(req.user!);
    res.json({ files });
  } catch (err) {
    next(err);
  }
};

export const deleteMyUpload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: "url harus berupa string tidak kosong" });
    }
    const { deleteMyUpload: deleteMyUploadDAL } = await import("../dal/uploadedFiles");
    await deleteMyUploadDAL(req.user!, url.trim());
    res.json({ message: "Berkas berhasil dihapus", deleted: true });
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return res.status(404).json({ error: err.message, code: "NOT_FOUND" });
    if (err?.code === "FILE_IN_USE") return res.status(409).json({ error: err.message, code: "FILE_IN_USE" });
    if (err?.status === 502) return res.status(502).json({ error: err.message });
    next(err);
  }
};

export default {
  uploadSingle,
  uploadMultiple,
  listMyUploads,
  deleteMyUpload,
};
