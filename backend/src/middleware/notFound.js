module.exports = function notFound(req, res) {
  res.status(404).json({ ok: false, error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
};
