// Controller untuk menangani upload file tunggal atau jamak
const uploadSingle = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Tidak ada file yang diunggah" });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL.replace(/\/$/, "")
      : `${req.protocol}://${req.get("host")}`;

    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({
      message: "Upload file berhasil",
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (err) {
    next(err);
  }
};

const uploadMultiple = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Tidak ada file yang diunggah" });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL.replace(/\/$/, "")
      : `${req.protocol}://${req.get("host")}`;

    const uploadedFiles = req.files.map((file) => ({
      url: `${baseUrl}/uploads/${file.filename}`,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
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

module.exports = {
  uploadSingle,
  uploadMultiple,
};
