import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { zip } from '../scripts/zip.mjs';
test('deployment ZIP retains file contents and valid central directory', () => {
  const archive = zip([
    { name: 'app/file.mjs', data: Buffer.from('hello cloud') },
    { name: 'app/utf8.txt', data: Buffer.from('安全') },
  ]);
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  const length = archive.readUInt32LE(18),
    nameLength = archive.readUInt16LE(26);
  assert.equal(archive.subarray(30, 30 + nameLength).toString(), 'app/file.mjs');
  assert.equal(
    inflateRawSync(archive.subarray(30 + nameLength, 30 + nameLength + length)).toString(),
    'hello cloud',
  );
  const end = archive.subarray(-22);
  assert.equal(end.readUInt32LE(0), 0x06054b50);
  assert.equal(end.readUInt16LE(10), 2);
  assert.equal(archive.readUInt32LE(end.readUInt32LE(16)), 0x02014b50);
});
