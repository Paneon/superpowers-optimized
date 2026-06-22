#!/usr/bin/env node
// Fixture: writes a marker file so the adapter test can verify
// dispatch occurred. Path is taken from PI_TRACK_EDITS_MARKER.
'use strict';
const fs = require('fs');
const marker = process.env.PI_TRACK_EDITS_MARKER;
if (marker) {
  let payload = '';
  process.stdin.on('data', d => (payload += d));
  process.stdin.on('end', () => {
    try { fs.writeFileSync(marker, payload); } catch {}
    process.stdout.write('{}');
  });
} else {
  process.stdout.write('{}');
}
