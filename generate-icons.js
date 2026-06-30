// 生成问卷助手图标 PNG 文件
// 运行: node generate-icons.js
// 生成 16x16, 48x48, 128x128 的绿色渐变圆角方形图标

const zlib = require('zlib');
const fs = require('fs');

function createPNG(width, height, pixelFn) {
  // 创建原始像素数据（RGBA）
  const rawData = Buffer.alloc((width * 4 + 1) * height); // +1 for filter byte per row
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
      rawData[offset + 3] = a;
    }
  }

  // 压缩像素数据
  const compressed = zlib.deflateSync(rawData);

  // 构建 PNG
  const chunks = [];

  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(createChunk('IHDR', ihdr));

  // IDAT
  chunks.push(createChunk('IDAT', compressed));

  // IEND
  chunks.push(createChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat([signature, ...chunks]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 像素函数：绿色圆角方形 + 白色字母 "W"
function iconPixel(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.38;
  const cornerRadius = Math.min(w, h) * 0.18;

  // 计算到圆角矩形边缘的距离
  const dx = Math.max(0, Math.abs(x - cx) - (w / 2 - cornerRadius));
  const dy = Math.max(0, Math.abs(y - cy) - (h / 2 - cornerRadius));
  const distToCorner = Math.sqrt(dx * dx + dy * dy);

  // 主体圆角矩形
  const inRect = (Math.abs(x - cx) <= w / 2 - cornerRadius || Math.abs(y - cy) <= h / 2 - cornerRadius) ||
                  distToCorner <= cornerRadius;

  if (!inRect) return [0, 0, 0, 0]; // 透明

  // 渐变绿色
  const gradient = 0.3 + 0.7 * (1 - y / h);
  const r = Math.round(30 * gradient);
  const g = Math.round(180 * gradient);
  const b = Math.round(80 * gradient);

  // 绘制简单的 "W" 字母（白色）
  // 简化为：中央白色圆点（小尺寸看不清字母）
  if (w >= 48) {
    const distToCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const innerRadius = radius * 0.45;
    if (distToCenter < innerRadius + 1 && distToCenter > innerRadius - 1) {
      return [255, 255, 255, 220]; // 白色圆环
    }
  } else {
    // 小图标：中心白点
    const distToCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (distToCenter < radius * 0.3) {
      return [255, 255, 255, 220];
    }
  }

  return [r, g, b, 255];
}

// 生成三种尺寸
[16, 48, 128].forEach(size => {
  const png = createPNG(size, size, iconPixel);
  fs.writeFileSync(`assets/icon${size}.png`, png);
  console.log(`Created assets/icon${size}.png (${png.length} bytes)`);
});

console.log('All icons generated.');
