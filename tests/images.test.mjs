import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizePhoto } from "../src/lib/image-processing.ts";
import { MAX_PHOTO_BYTES, photoFormat } from "../src/lib/photo-rules.ts";

test("JPG, PNG e WEBP são decodificados e reprocessados sem EXIF", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const input = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#305070" } })
      .withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    assert.equal(photoFormat(input), format);
    const output = await normalizePhoto(input);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 768);
    assert.equal(metadata.height, 768);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
  }
});

test("arquivos inválidos, corrompidos ou maiores que 5 MB são recusados", async () => {
  await assert.rejects(normalizePhoto(new Uint8Array(MAX_PHOTO_BYTES + 1)), /size/);
  await assert.rejects(normalizePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), /format/);
  await assert.rejects(normalizePhoto(Buffer.from([137,80,78,71,13,10,26,10])));
  await assert.rejects(normalizePhoto(Buffer.from("arquivo de texto com extensão .jpg")), /format/);
});
