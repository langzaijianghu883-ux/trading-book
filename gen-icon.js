// PWA 图标生成器（node gen-icon.js）
// 生成 icon-512.png / icon-192.png / icon-180.png：深蓝渐变圆角底 + 亮蓝柱状图图案
const zlib = require("zlib");
const fs = require("fs");

function crc32(buf){
  let c, table = crc32.table;
  if(!table){
    table = crc32.table = new Int32Array(256);
    for(let n=0;n<256;n++){
      c = n;
      for(let k=0;k<8;k++) c = c & 1 ? 0xEDB88320 ^ (c>>>1) : c>>>1;
      table[n] = c;
    }
  }
  c = 0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c>>>8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type,"ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(size, file){
  const px = Buffer.alloc(size*size*4);
  const R = size*0.20;  // 圆角半径
  const inRounded = (x,y)=>{
    if(x>=R && x<=size-1-R && y>=R && y<=size-1-R) return true;
    if(x<R && y<R) return Math.hypot(x-(R-0.5), y-(R-0.5)) <= R-0.5;
    if(x>size-1-R && y<R) return Math.hypot(x-(size-0.5-R), y-(R-0.5)) <= R-0.5;
    if(x<R && y>size-1-R) return Math.hypot(x-(R-0.5), y-(size-0.5-R)) <= R-0.5;
    if(x>size-1-R && y>size-1-R) return Math.hypot(x-(size-0.5-R), y-(size-0.5-R)) <= R-0.5;
    return true;
  };
  const lerp = (a,b,t)=>a+(b-a)*t;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const i = (y*size+x)*4;
    if(!inRounded(x,y)){ px[i]=px[i+1]=px[i+2]=px[i+3]=0; continue; }
    const t = y/(size-1);
    px[i]   = Math.round(lerp(0x13, 0x1c, t));   // R 渐变
    px[i+1] = Math.round(lerp(0x24, 0x35, t));   // G
    px[i+2] = Math.round(lerp(0x3a, 0x50, t));   // B
    px[i+3] = 255;
  }
  // 三根柱子（象征账本/交易/趋势）
  const barW = size*0.13, gap = size*0.11;
  const totalW = barW*3 + gap*2;
  const x0 = (size-totalW)/2, baseY = size*0.72;
  const heights = [0.34, 0.58, 0.46];  // 相对高度
  const barColor = [0x4d, 0x9f, 0xff];
  for(let b=0;b<3;b++){
    const bx0 = x0 + b*(barW+gap);
    const h = heights[b]*size*0.44;
    const by0 = baseY - h;
    for(let y=Math.floor(by0); y<baseY; y++) for(let x=Math.floor(bx0); x<bx0+barW; x++){
      if(x<0||y<0||x>=size||y>=size) continue;
      const i=(y*size+x)*4;
      px[i]=barColor[0]; px[i+1]=barColor[1]; px[i+2]=barColor[2]; px[i+3]=255;
    }
  }
  // 柱顶横线（表示收盘价线）
  const lineY = Math.round(baseY - 0.58*size*0.44 - 2);
  for(let x=Math.floor(x0-4); x<Math.ceil(x0+totalW+4); x++){
    if(x<0||x>=size) continue;
    for(let dy=0;dy<2;dy++){
      const y = lineY+dy; if(y<0||y>=size) continue;
      const i=(y*size+x)*4;
      px[i]=0x7b; px[i+1]=0x5c; px[i+2]=0xff; px[i+3]=255;
    }
  }
  const raw = Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++){
    raw[y*(size*4+1)] = 0;   // filter: None
    px.copy(raw, y*(size*4+1)+1, y*size*4, (y+1)*size*4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=6;       // 8bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, {level:9})),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  console.log("已生成 "+file+" ("+size+"x"+size+", "+png.length+" 字节)");
}
writePng(512, "icon-512.png");
writePng(192, "icon-192.png");
writePng(180, "icon-180.png");
