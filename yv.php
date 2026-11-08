<?php
// Retired. Bible requests now go through /api/yv (a Vercel function) and the key is no longer stored in this file.
http_response_code(410);
header('Content-Type: application/json');
echo '{"error":"retired, use /api/yv"}';
