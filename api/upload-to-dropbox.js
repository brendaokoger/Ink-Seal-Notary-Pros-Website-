// Dropbox integration has been replaced by Google Drive.
// Document uploads now go through /api/upload-to-drive → Google Apps Script → DriveApp.
// This endpoint is disabled and returns 410 Gone to any caller.

module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(410).json({
    success: false,
    error:   'Dropbox upload is disabled. Document uploads now use /api/upload-to-drive (Google Drive).'
  });
};
