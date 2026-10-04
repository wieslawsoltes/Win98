/**
 * Retro desktop rendering surface.
 * WebGPU -> WebGL2 -> Canvas2D. No dependencies and no animation while idle.
 * Window chrome remains accessible HTML, composited by the browser.
 */

export const WALLPAPER_PATTERNS = Object.freeze(['none', 'tiles', 'waves', 'clouds', 'sandstone', 'circuit', 'stars']);
export const SCREENSAVERS = Object.freeze(['none', 'starfield', 'pipes', 'mystify']);
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fract = value => value - Math.floor(value);
const mix = (a, b, t) => a + (b - a) * t;
const now = () => performance.now();
const hash = (x, y = 0) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const FITS = ['cover', 'contain', 'stretch', 'center', 'tile'];
function parseColor(value) {
  const normalized = typeof value === 'string' ? value.trim() : '#008080';
  let hex = normalized.replace(/^#/, '');
  if (/^[a-f\d]{3}$/i.test(hex)) hex = hex.split('').map(c => c + c).join('');
  if (!/^[a-f\d]{6}$/i.test(hex)) hex = '008080';
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function noise(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = fract(x),
    fy = fract(y);
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), fx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}
function periodicNoise(x, y, period) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    wrap = n => (n % period + period) % period;
  const sample = (dx, dy) => hash(wrap(ix + dx), wrap(iy + dy));
  let fx = fract(x),
    fy = fract(y);
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return mix(mix(sample(0, 0), sample(1, 0), fx), mix(sample(0, 1), sample(1, 1), fx), fy);
}
function wallpaperPixel(x, y, pattern, base) {
  let color = base.slice();
  const nx = (x % 256 + 256) % 256,
    ny = (y % 256 + 256) % 256;
  if (pattern === 1) {
    const tx = nx % 8,
      ty = ny % 8;
    const shade = tx === 0 || ty === 0 ? .80 : tx === 7 || ty === 7 ? 1.16 : (tx + ty) % 4 < 2 ? 1.02 : .95;
    color = base.map(c => c * shade);
  } else if (pattern === 2) {
    const w = Math.sin(nx * .147262 + Math.sin(ny * .073631) * 2) + Math.sin(ny * .098175);
    color = base.map((c, i) => c * (.72 + .20 * w) + [0, .12, .14][i]);
  } else if (pattern === 3) {
    const n = periodicNoise(nx / 64, ny / 64, 4) * .58 + periodicNoise(nx / 32, ny / 32, 8) * .28 + periodicNoise(nx / 16, ny / 16, 16) * .14;
    const t = clamp((n - .28) * 1.65, 0, 1);
    color = [.21, .43, .70].map((c, i) => mix(c, [.93, .95, .98][i], t));
  } else if (pattern === 4) {
    const grain = hash(nx, ny),
      n = noise(nx / 23, ny / 23);
    const bands = Math.sin((ny + n * 24) * .26) * .035;
    color = [.73, .66, .49].map((c, i) => c + (grain - .5) * .14 + (n - .5) * .16 + bands - i * .006);
  } else if (pattern === 5) {
    const tx = nx % 32,
      ty = ny % 32,
      seed = hash(Math.floor(nx / 32), Math.floor(ny / 32));
    const bend = seed > .5 ? tx : 31 - tx;
    const trace = Math.abs(ty - 8) < 1 && bend > 8 || Math.abs(bend - 8) < 1 && ty > 8 || Math.abs(ty - 24) < 1 && bend < 24;
    const pad = Math.hypot(bend - 8, ty - 8) < 2.5 || Math.hypot(bend - 24, ty - 24) < 2.5;
    color = trace || pad ? [.12, .55, .43] : [.025, .18, .16];
  } else if (pattern === 6) {
    const sx = nx % 16,
      sy = ny % 16,
      seed = hash(Math.floor(nx / 16), Math.floor(ny / 16));
    const dx = sx - (3 + Math.floor(seed * 9)),
      dy = sy - (3 + Math.floor(fract(seed * 17) * 9));
    const star = Math.abs(dx) < 1 && Math.abs(dy) < 1 && seed > .72;
    color = star ? [.72 + seed * .28, .76 + seed * .24, 1] : [.025, .035, .105];
  }
  const dither = ((x + y * 2) % 4 - 1.5) / 255;
  return color.map(c => clamp(c + (pattern ? dither : 0), 0, 1));
}

// Four vec4<f32> fields: exactly 64 bytes with 16-byte alignment in WGSL.
export const DESKTOP_WGSL = /* wgsl */`
struct Uniforms {
  viewport: vec4<f32>,
  baseColor: vec4<f32>,
  options: vec4<f32>,
  imageSize: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var wallpaperImage: texture_2d<f32>;

fn hash2(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn noise2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let t = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2<f32>(1.0, 0.0)), t.x),
    mix(hash2(i + vec2<f32>(0.0, 1.0)), hash2(i + vec2<f32>(1.0)), t.x), t.y);
}
fn periodicHash(p: vec2<f32>, period: f32) -> f32 { return hash2(p - floor(p / period) * period); }
fn periodicNoise2(p: vec2<f32>, period: f32) -> f32 {
  let i = floor(p); let f = fract(p); let t = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(periodicHash(i, period), periodicHash(i + vec2<f32>(1.0, 0.0), period), t.x),
    mix(periodicHash(i + vec2<f32>(0.0, 1.0), period), periodicHash(i + vec2<f32>(1.0), period), t.x), t.y);
}
fn wallpaper(p: vec2<f32>) -> vec3<f32> {
  let q = p - floor(p / 256.0) * 256.0;
  let pattern = i32(u.options.x);
  var color = u.baseColor.rgb;
  if (pattern == 1) {
    let t = q - floor(q / 8.0) * 8.0;
    var shade = select(0.95, 1.02, fract((t.x + t.y) / 4.0) < 0.5);
    if (t.x == 0.0 || t.y == 0.0) { shade = 0.8; }
    else if (t.x == 7.0 || t.y == 7.0) { shade = 1.16; }
    color *= shade;
  } else if (pattern == 2) {
    let w = sin(q.x * 0.147262 + sin(q.y * 0.073631) * 2.0) + sin(q.y * 0.098175);
    color = color * (0.72 + 0.20 * w) + vec3<f32>(0.0, 0.12, 0.14);
  } else if (pattern == 3) {
    let n = periodicNoise2(q / 64.0, 4.0) * 0.58 + periodicNoise2(q / 32.0, 8.0) * 0.28 + periodicNoise2(q / 16.0, 16.0) * 0.14;
    color = mix(vec3<f32>(0.21, 0.43, 0.70), vec3<f32>(0.93, 0.95, 0.98), clamp((n - 0.28) * 1.65, 0.0, 1.0));
  } else if (pattern == 4) {
    let grain = hash2(q);
    let n = noise2(q / 23.0);
    let bands = sin((q.y + n * 24.0) * 0.26) * 0.035;
    color = vec3<f32>(0.73, 0.654, 0.478) + vec3<f32>((grain - 0.5) * 0.14 + (n - 0.5) * 0.16 + bands);
  } else if (pattern == 5) {
    let t = q - floor(q / 32.0) * 32.0;
    let seed = hash2(floor(q / 32.0));
    let bend = select(31.0 - t.x, t.x, seed > 0.5);
    let trace = (abs(t.y - 8.0) < 1.0 && bend > 8.0) || (abs(bend - 8.0) < 1.0 && t.y > 8.0) || (abs(t.y - 24.0) < 1.0 && bend < 24.0);
    let pad = length(vec2<f32>(bend - 8.0, t.y - 8.0)) < 2.5 || length(vec2<f32>(bend - 24.0, t.y - 24.0)) < 2.5;
    color = select(vec3<f32>(0.025, 0.18, 0.16), vec3<f32>(0.12, 0.55, 0.43), trace || pad);
  } else if (pattern == 6) {
    let t = q - floor(q / 16.0) * 16.0;
    let seed = hash2(floor(q / 16.0));
    let d = t - vec2<f32>(3.0 + floor(seed * 9.0), 3.0 + floor(fract(seed * 17.0) * 9.0));
    let star = abs(d.x) < 1.0 && abs(d.y) < 1.0 && seed > 0.72;
    color = select(vec3<f32>(0.025, 0.035, 0.105), vec3<f32>(0.72 + seed * 0.28, 0.76 + seed * 0.24, 1.0), star);
  }
  let checker = p.x + p.y * 2.0;
  let dither = (checker - floor(checker / 4.0) * 4.0 - 1.5) / 255.0;
  return clamp(color + vec3<f32>(select(0.0, dither, pattern != 0)), vec3<f32>(0.0), vec3<f32>(1.0));
}
@vertex fn backgroundVS(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4<f32>(vec2<f32>(x, y) * 2.0 - vec2<f32>(1.0), 0.0, 1.0);
}
@fragment fn backgroundFS(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  if (u.options.y > 0.0) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  let pixel = position.xy;
  let base = wallpaper(floor(pixel / u.viewport.w));
  if (u.options.z < 0.5) { return vec4<f32>(base, 1.0); }
  let viewSize = u.viewport.xy;
  let imageSize = max(u.imageSize.xy, vec2<f32>(1.0));
  var uv = pixel / viewSize;
  let fit = i32(u.options.w);
  if (fit == 4) { uv = fract(pixel / u.viewport.w / imageSize); }
  else if (fit != 2) {
    var scale = max(viewSize.x / imageSize.x, viewSize.y / imageSize.y);
    if (fit == 1) { scale = min(viewSize.x / imageSize.x, viewSize.y / imageSize.y); }
    else if (fit == 3) { scale = u.viewport.w; }
    uv = (pixel - (viewSize - imageSize * scale) * 0.5) / (imageSize * scale);
    if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return vec4<f32>(base, 1.0); }
  }
  let sampled = textureSampleLevel(wallpaperImage, imageSampler, uv, 0.0);
  return vec4<f32>(mix(base, sampled.rgb, sampled.a), 1.0);
}
struct GeometryOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};
@vertex fn geometryVS(@location(0) position: vec2<f32>, @location(1) color: vec4<f32>) -> GeometryOut {
  var output: GeometryOut;
  let p = position * u.viewport.w / u.viewport.xy;
  output.position = vec4<f32>(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  output.color = color;
  return output;
}
@fragment fn geometryFS(input: GeometryOut) -> @location(0) vec4<f32> { return input.color; }
`;
const GL_BACKGROUND_VERTEX = `#version 300 es
precision highp float;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }
`;
const GL_BACKGROUND_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 uViewport, uColor, uOptions, uImageSize;
uniform sampler2D uImage;
out vec4 outputColor;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) { vec2 i=floor(p), f=fract(p); vec2 t=f*f*(3.0-2.0*f); return mix(mix(hash2(i),hash2(i+vec2(1,0)),t.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1)),t.x),t.y); }
float periodicHash(vec2 p,float period){return hash2(mod(p,period));}
float periodicNoise2(vec2 p,float period){vec2 i=floor(p),f=fract(p);vec2 t=f*f*(3.0-2.0*f);return mix(mix(periodicHash(i,period),periodicHash(i+vec2(1,0),period),t.x),mix(periodicHash(i+vec2(0,1),period),periodicHash(i+vec2(1),period),t.x),t.y);}
vec3 wallpaper(vec2 p) {
  vec2 q=mod(p,256.0); int pattern=int(uOptions.x); vec3 color=uColor.rgb;
  if (pattern==1) { vec2 t=mod(q,8.0); float shade=mod(t.x+t.y,4.0)<2.0?1.02:.95; if(t.x==0.0||t.y==0.0)shade=.8; else if(t.x==7.0||t.y==7.0)shade=1.16; color*=shade; }
  else if(pattern==2) { float w=sin(q.x*.147262+sin(q.y*.073631)*2.0)+sin(q.y*.098175); color=color*(.72+.20*w)+vec3(0,.12,.14); }
  else if(pattern==3) { float n=periodicNoise2(q/64.0,4.0)*.58+periodicNoise2(q/32.0,8.0)*.28+periodicNoise2(q/16.0,16.0)*.14; color=mix(vec3(.21,.43,.70),vec3(.93,.95,.98),clamp((n-.28)*1.65,0.0,1.0)); }
  else if(pattern==4) { float grain=hash2(q),n=noise2(q/23.0),bands=sin((q.y+n*24.0)*.26)*.035; color=vec3(.73,.654,.478)+vec3((grain-.5)*.14+(n-.5)*.16+bands); }
  else if(pattern==5) { vec2 t=mod(q,32.0); float seed=hash2(floor(q/32.0)),bend=seed>.5?t.x:31.0-t.x; bool trace=(abs(t.y-8.0)<1.0&&bend>8.0)||(abs(bend-8.0)<1.0&&t.y>8.0)||(abs(t.y-24.0)<1.0&&bend<24.0); bool pad=length(vec2(bend-8.0,t.y-8.0))<2.5||length(vec2(bend-24.0,t.y-24.0))<2.5; color=trace||pad?vec3(.12,.55,.43):vec3(.025,.18,.16); }
  else if(pattern==6) { vec2 t=mod(q,16.0); float seed=hash2(floor(q/16.0)); vec2 d=t-vec2(3.0+floor(seed*9.0),3.0+floor(fract(seed*17.0)*9.0)); bool star=abs(d.x)<1.0&&abs(d.y)<1.0&&seed>.72; color=star?vec3(.72+seed*.28,.76+seed*.24,1):vec3(.025,.035,.105); }
  float dither=(mod(p.x+p.y*2.0,4.0)-1.5)/255.0; return clamp(color+vec3(pattern==0?0.0:dither),0.0,1.0);
}
void main() {
  if(uOptions.y>0.0){outputColor=vec4(0,0,0,1);return;}
  vec2 pixel=vec2(gl_FragCoord.x,uViewport.y-gl_FragCoord.y);
  vec3 base=wallpaper(floor(pixel/uViewport.w));
  if(uOptions.z<.5){outputColor=vec4(base,1);return;}
  vec2 size=uViewport.xy, imageSize=max(uImageSize.xy,vec2(1)); vec2 uv=pixel/size; int fit=int(uOptions.w);
  if(fit==4)uv=fract(pixel/uViewport.w/imageSize);
  else if(fit!=2){float scale=max(size.x/imageSize.x,size.y/imageSize.y);if(fit==1)scale=min(size.x/imageSize.x,size.y/imageSize.y);else if(fit==3)scale=uViewport.w;uv=(pixel-(size-imageSize*scale)*.5)/(imageSize*scale);if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1)))){outputColor=vec4(base,1);return;}}
  vec4 sampled=texture(uImage,uv); outputColor=vec4(mix(base,sampled.rgb,sampled.a),1);
}
`;
const GL_GEOMETRY_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
layout(location=1) in vec4 aColor;
uniform vec4 uViewport;
out vec4 vColor;
void main(){vec2 p=aPosition*uViewport.w/uViewport.xy;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0,1);vColor=aColor;}
`;
const GL_GEOMETRY_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outputColor;
void main(){outputColor=vColor;}
`;
function addVertex(vertices, x, y, color, alpha = 1) {
  vertices.push(x, y, color[0], color[1], color[2], alpha);
}
function addLine(vertices, x1, y1, x2, y2, width, color, alpha = 1) {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / length * width / 2,
    ny = (x2 - x1) / length * width / 2;
  addVertex(vertices, x1 + nx, y1 + ny, color, alpha);
  addVertex(vertices, x1 - nx, y1 - ny, color, alpha);
  addVertex(vertices, x2 + nx, y2 + ny, color, alpha);
  addVertex(vertices, x2 + nx, y2 + ny, color, alpha);
  addVertex(vertices, x1 - nx, y1 - ny, color, alpha);
  addVertex(vertices, x2 - nx, y2 - ny, color, alpha);
}
function hue(h) {
  return [0, 2 / 3, 1 / 3].map(o => clamp(Math.abs(fract(h + o) * 6 - 3) - 1, 0, 1));
}
function bounce(t) {
  return 1 - Math.abs(fract(t / 2) * 2 - 1);
}
function makeStars(vertices, width, height, time, options) {
  const count = clamp(Math.round(options.density || 420), 80, 1000);
  const speed = clamp(Number(options.speed) || 1, .15, 5);
  for (let i = 0; i < count; i++) {
    const z = .04 + fract(hash(i, 2) - time * .16 * speed) * .96;
    const sx = (hash(i, 4) - .5) * width * .75,
      sy = (hash(i, 6) - .5) * height * .75;
    const x = width / 2 + sx / z,
      y = height / 2 + sy / z;
    if (x < -10 || y < -10 || x > width + 10 || y > height + 10) continue;
    const previousZ = z + .007 * speed;
    let oldX = width / 2 + sx / previousZ,
      oldY = height / 2 + sy / previousZ;
    if (Math.hypot(x - oldX, y - oldY) < 1) oldY = y - 1;
    const brightness = clamp(.35 + (1 - z) * .75, 0, 1);
    addLine(vertices, oldX, oldY, x, y, clamp(1.4 - z, .7, 1.5), [.85 * brightness, .92 * brightness, brightness]);
  }
}
function makeMystify(vertices, width, height, time, options) {
  const speed = clamp(Number(options.speed) || 1, .15, 5);
  const trails = 15,
    polygons = 2,
    pointCount = 4;
  for (let trail = trails - 1; trail >= 0; trail--) {
    const t = (time - trail * .045) * speed;
    for (let polygon = 0; polygon < polygons; polygon++) {
      const color = hue(fract(.38 + polygon * .42 + time * .025));
      const points = [];
      for (let point = 0; point < pointCount; point++) {
        const seed = polygon * 7 + point * 17;
        points.push([24 + bounce(hash(seed, 1) * 2 + t * (.10 + hash(seed, 3) * .13)) * Math.max(1, width - 48), 24 + bounce(hash(seed, 5) * 2 + t * (.09 + hash(seed, 7) * .16)) * Math.max(1, height - 48)]);
      }
      for (let point = 0; point < pointCount; point++) {
        const a = points[point],
          b = points[(point + 1) % pointCount];
        addLine(vertices, a[0], a[1], b[0], b[1], 1.15, color, Math.pow(1 - trail / trails, 1.4));
      }
    }
  }
}
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223 >>> 0;
    return state / 4294967296;
  };
}
function createPipePaths(cycle) {
  const random = randomGenerator(1998 + cycle * 317);
  return Array.from({
    length: 3
  }, (_, index) => {
    const points = [[(index - 1) * 2, Math.round(random() * 4) - 2, Math.round(random() * 4) - 2]];
    const used = new Set([points[0].join(',')]);
    let previousAxis = -1;
    for (let step = 0; step < 26; step++) {
      const last = points[points.length - 1];
      let next = null,
        axis = 0;
      for (let attempt = 0; attempt < 24; attempt++) {
        axis = Math.floor(random() * 3);
        if (axis === previousAxis && attempt < 12) continue;
        const candidate = last.slice();
        candidate[axis] += random() < .5 ? -1 : 1;
        if (candidate.some(v => Math.abs(v) > 3) || used.has(candidate.join(','))) continue;
        next = candidate;
        break;
      }
      if (!next) break;
      used.add(next.join(','));
      points.push(next);
      previousAxis = axis;
    }
    return points.map(p => p.map(v => v * .85));
  });
}
function makePipes(vertices, width, height, time, options, cache) {
  const speed = clamp(Number(options.speed) || 1, .15, 5);
  const clock = time * speed,
    cycle = Math.floor(clock / 23),
    localTime = clock % 23;
  if (cache.cycle !== cycle) {
    cache.cycle = cycle;
    cache.paths = createPipePaths(cycle);
  }
  const triangles = [],
    radius = .13,
    sides = 8;
  const angle = time * .045 + .52,
    ca = Math.cos(angle),
    sa = Math.sin(angle),
    cx = Math.cos(-.29),
    sx = Math.sin(-.29);
  const rotate = p => {
    const x = p[0] * ca + p[2] * sa,
      z = -p[0] * sa + p[2] * ca;
    return [x, p[1] * cx - z * sx, p[1] * sx + z * cx];
  };
  const project = p => {
    const r = rotate(p),
      scale = Math.min(width, height) * 1.00 / (r[2] + 8.3);
    return [width / 2 + r[0] * scale, height / 2 - r[1] * scale, r[2]];
  };
  const lit = (normal, color) => {
    const n = rotate(normal);
    const light = .24 + .68 * Math.max(0, n[0] * -.44 + n[1] * .64 + n[2] * -.63);
    const shine = Math.pow(Math.max(0, n[0] * -.25 + n[1] * .45 + n[2] * -.86), 18) * .58;
    return color.map(c => clamp(c * light + shine, 0, 1));
  };
  const triangle = (a, b, c, na, nb, nc, color) => {
    const pa = project(a),
      pb = project(b),
      pc = project(c);
    triangles.push({
      depth: pa[2] + pb[2] + pc[2],
      points: [pa, pb, pc],
      colors: [lit(na, color), lit(nb, color), lit(nc, color)]
    });
  };
  const sphere = (center, color) => {
    const rings = 4;
    const sample = (ring, side) => {
      const lat = -Math.PI / 2 + ring / rings * Math.PI,
        lon = side / sides * TAU;
      const n = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      return [center.map((c, i) => c + n[i] * radius), n];
    };
    for (let ring = 0; ring < rings; ring++) for (let side = 0; side < sides; side++) {
      const [a, na] = sample(ring, side),
        [b, nb] = sample(ring + 1, side),
        [c, nc] = sample(ring, side + 1),
        [d, nd] = sample(ring + 1, side + 1);
      triangle(a, b, c, na, nb, nc, color);
      triangle(c, b, d, nc, nb, nd, color);
    }
  };
  const cylinder = (a, b, color) => {
    const delta = b.map((v, i) => v - a[i]);
    const axis = Math.abs(delta[0]) > .001 ? 0 : Math.abs(delta[1]) > .001 ? 1 : 2;
    const one = (axis + 1) % 3,
      two = (axis + 2) % 3;
    for (let side = 0; side < sides; side++) {
      const t = side / sides * TAU,
        t2 = (side + 1) / sides * TAU;
      const n1 = [0, 0, 0],
        n2 = [0, 0, 0];
      n1[one] = Math.cos(t);
      n1[two] = Math.sin(t);
      n2[one] = Math.cos(t2);
      n2[two] = Math.sin(t2);
      const p1 = a.map((v, i) => v + n1[i] * radius),
        p2 = b.map((v, i) => v + n1[i] * radius),
        p3 = a.map((v, i) => v + n2[i] * radius),
        p4 = b.map((v, i) => v + n2[i] * radius);
      triangle(p1, p2, p3, n1, n1, n2, color);
      triangle(p3, p2, p4, n2, n1, n2, color);
    }
  };
  const colors = [[.12, .46, 1], [1, .18, .15], [1, .78, .12]];
  cache.paths.forEach((path, index) => {
    const progress = Math.max(.01, (localTime - index * .8) * 1.55);
    const count = Math.min(path.length - 1, Math.floor(progress));
    for (let segment = 0; segment < count; segment++) {
      cylinder(path[segment], path[segment + 1], colors[index]);
      sphere(path[segment], colors[index]);
    }
    if (count < path.length - 1) {
      const end = path[count].map((v, i) => mix(v, path[count + 1][i], fract(progress)));
      cylinder(path[count], end, colors[index]);
      sphere(path[count], colors[index]);
      sphere(end, colors[index]);
    } else sphere(path[path.length - 1], colors[index]);
  });
  // Painter sorting keeps the same portable geometry path across all three APIs.
  triangles.sort((a, b) => b.depth - a.depth);
  for (const tri of triangles) for (let i = 0; i < 3; i++) addVertex(vertices, tri.points[i][0], tri.points[i][1], tri.colors[i]);
}
function imageDimensions(source) {
  return [source?.naturalWidth || source?.videoWidth || source?.width || 0, source?.naturalHeight || source?.videoHeight || source?.height || 0];
}
export class DesktopRenderer {
  constructor(canvas, {
    onBackendChange
  } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('DesktopRenderer needs an HTMLCanvasElement.');
    this.canvas = canvas;
    this.onBackendChange = typeof onBackendChange === 'function' ? onBackendChange : () => {};
    this._backend = 'uninitialized';
    this._contextKind = null;
    this._disposed = false;
    this._generation = 0;
    this._raf = 0;
    this._initializing = false;
    this._recovering = false;
    this._wallpaper = {
      color: '#008080',
      pattern: 'none',
      image: null,
      fit: 'cover'
    };
    this._base = parseColor('#008080');
    this._saver = 'none';
    this._saverOptions = {};
    this._imageSource = null;
    this._imageSerial = 0;
    this._imageReady = false;
    this._imageSize = [1, 1];
    this._effectTime = 0;
    this._lastTick = now();
    this._lastRender = 0;
    this._dirty = true;
    this._idle = false;
    this._pipeCache = {};
    this._tileCache = null;
    this._uniforms = new Float32Array(16);
    this._stats = {
      backend: 'uninitialized',
      frameTime: 0,
      frames: 0,
      fps: 0,
      adapter: '',
      fallbackReason: '',
      imageError: '',
      width: 0,
      height: 0,
      dpr: 1,
      drawCalls: 0
    };
    this._onResize = () => {
      this._resize();
      this._invalidate();
    };
    this._onVisibility = () => {
      this._lastTick = now();
      if (document.hidden) this._cancelFrame();else this._invalidate();
    };
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(canvas);
    }
    globalThis.addEventListener?.('resize', this._onResize);
    globalThis.document?.addEventListener('visibilitychange', this._onVisibility);
  }
  get stats() {
    return {
      ...this._stats,
      screensaver: this._saver,
      paused: this._idle
    };
  }
  get backend() {
    return this._backend;
  }
  async init(preference = 'auto') {
    if (this._disposed) throw new Error('This renderer has been disposed.');
    const aliases = {
      webgl: 'webgl2',
      canvas: 'canvas2d',
      '2d': 'canvas2d',
      gpu: 'webgpu'
    };
    preference = aliases[preference] || preference;
    if (!['auto', 'webgpu', 'webgl2', 'canvas2d'].includes(preference)) preference = 'auto';
    const generation = ++this._generation;
    this._initializing = true;
    this._cancelFrame();
    this._teardownBackend();
    const choices = preference === 'canvas2d' ? ['canvas2d'] : preference === 'webgl2' ? ['webgl2', 'canvas2d'] : ['webgpu', 'webgl2', 'canvas2d'];
    let lastError = null;
    const reasons = this._recovering && this._stats.fallbackReason ? [this._stats.fallbackReason] : [];
    for (const backend of choices) {
      if (generation !== this._generation || this._disposed) return this;
      try {
        if (backend === 'webgpu') await this._initGPU(generation);else if (backend === 'webgl2') this._initGL();else this._initCanvas();
        if (generation !== this._generation || this._disposed) return this;
        this._backend = backend;
        this._stats.backend = backend;
        this._stats.adapter = backend === 'webgpu' ? this._gpu.adapterName : backend === 'webgl2' ? this._gl.getParameter(this._gl.RENDERER) : 'Browser Canvas 2D';
        this._stats.fallbackReason = reasons.join(' | ');
        this._resize();
        if (this._imageSource) this._safeUploadImage();
        this._initializing = false;
        this._lastTick = now();
        this._notifyBackend();
        this._invalidate();
        return this;
      } catch (error) {
        if (generation !== this._generation || this._disposed) return this;
        lastError = error;
        reasons.push(`${backend}: ${error.message || String(error)}`);
        this._teardownBackend();
      }
    }
    this._initializing = false;
    this._backend = 'unavailable';
    this._stats.backend = 'unavailable';
    this._stats.fallbackReason = reasons.join(' | ') || 'No supported canvas context.';
    this._notifyBackend();
    throw lastError || new Error('No supported canvas context.');
  }
  async setWallpaper(settings = {}) {
    if (this._disposed) return false;
    const serial = Object.prototype.hasOwnProperty.call(settings, 'image') ? ++this._imageSerial : this._imageSerial;
    if (typeof settings.color === 'string') this._wallpaper.color = settings.color;
    if (WALLPAPER_PATTERNS.includes(settings.pattern)) this._wallpaper.pattern = settings.pattern;
    if (FITS.includes(settings.fit)) this._wallpaper.fit = settings.fit;
    this._base = parseColor(this._wallpaper.color);
    this._tileCache = null;
    this._stats.imageError = '';
    if (Object.prototype.hasOwnProperty.call(settings, 'image')) {
      this._wallpaper.image = settings.image;
      this._imageSource = null;
      this._imageReady = false;
      if (settings.image) {
        try {
          let source = settings.image;
          if (typeof source === 'string') {
            source = await new Promise((resolve, reject) => {
              const img = new Image();
              if (!/^(data:|blob:)/i.test(settings.image)) img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error('The wallpaper image could not be loaded.'));
              img.src = settings.image;
            });
          }
          if (serial !== this._imageSerial || this._disposed) return false;
          if (!imageDimensions(source).every(n => n > 0)) throw new Error('The image has no drawable pixels.');
          this._imageSource = source;
          this._safeUploadImage();
        } catch (error) {
          this._stats.imageError = error.message || String(error);
          this._invalidate();
          return false;
        }
      }
    }
    this._invalidate();
    return true;
  }
  setScreensaver(name = 'none', options = {}) {
    if (this._disposed) return;
    this._saver = SCREENSAVERS.includes(name) ? name : 'none';
    this._saverOptions = {
      ...options
    };
    this._effectTime = 0;
    this._pipeCache = {};
    this._lastTick = now();
    this._invalidate();
  }

  /** Pause rendering when the presentation surface is intentionally not visible. */
  setIdle(idle = true) {
    this._idle = Boolean(idle);
    this._lastTick = now();
    if (this._idle) this._cancelFrame();else this._invalidate();
  }
  setPaused(paused = true) {
    this.setIdle(paused);
  }
  render() {
    this._invalidate();
  }

  /** Upload a Paint canvas/image. Call again after changing its pixels. */
  present(sourceCanvas, {
    fit = 'contain'
  } = {}) {
    if (this._disposed || !imageDimensions(sourceCanvas).every(n => n > 0)) return false;
    ++this._imageSerial;
    this._imageSource = sourceCanvas;
    this._wallpaper.image = sourceCanvas;
    this._wallpaper.fit = FITS.includes(fit) ? fit : 'contain';
    this._safeUploadImage();
    this._invalidate();
    return !this._stats.imageError;
  }
  _notifyBackend() {
    try {
      this.onBackendChange(this._backend, this.stats, this.canvas);
    } catch (error) {
      console.error('DesktopRenderer onBackendChange callback failed:', error);
    }
  }
  _context(type) {
    if (this._contextKind && this._contextKind !== type || this._freshContext) {
      const previous = this.canvas,
        replacement = previous.cloneNode(false);
      replacement.width = previous.width;
      replacement.height = previous.height;
      this._resizeObserver?.unobserve(previous);
      previous.replaceWith(replacement);
      this.canvas = replacement;
      this._resizeObserver?.observe(replacement);
      this._contextKind = null;
      this._freshContext = false;
    }
    const context = this.canvas.getContext(type, type === 'webgl2' ? {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    } : type === '2d' ? {
      alpha: false
    } : undefined);
    if (context) this._contextKind = type;
    return context;
  }
  async _initGPU(generation) {
    if (!globalThis.navigator?.gpu) throw new Error('WebGPU is unavailable in this browser or context.');
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'low-power'
    });
    if (!adapter) throw new Error('No WebGPU adapter is available.');
    if (generation !== this._generation || this._disposed) throw new Error('Initialization superseded.');
    const device = await adapter.requestDevice();
    if (generation !== this._generation || this._disposed) {
      device.destroy();
      throw new Error('Initialization superseded.');
    }
    const context = this._context('webgpu');
    if (!context) {
      device.destroy();
      throw new Error('Could not create a WebGPU canvas context.');
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    const info = adapter.info;
    const gpu = {
      device,
      context,
      adapterName: [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' · ') || 'WebGPU adapter',
      format
    };
    this._gpu = gpu;
    context.configure({
      device,
      format,
      alphaMode: 'opaque'
    });
    device.pushErrorScope('validation');
    const shader = device.createShaderModule({
      label: 'Retro desktop WGSL',
      code: DESKTOP_WGSL
    });
    const compilation = shader.getCompilationInfo ? await shader.getCompilationInfo() : null;
    const errors = compilation?.messages.filter(message => message.type === 'error');
    if (errors?.length) {
      await device.popErrorScope();
      throw new Error(errors.map(e => `WGSL ${e.lineNum}:${e.linePos} ${e.message}`).join('\n'));
    }
    const blend = {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add'
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add'
      }
    };
    const makePipeline = descriptor => device.createRenderPipelineAsync ? device.createRenderPipelineAsync(descriptor) : Promise.resolve(device.createRenderPipeline(descriptor));
    [gpu.background, gpu.geometry] = await Promise.all([makePipeline({
      label: 'Procedural desktop background',
      layout: 'auto',
      vertex: {
        module: shader,
        entryPoint: 'backgroundVS'
      },
      fragment: {
        module: shader,
        entryPoint: 'backgroundFS',
        targets: [{
          format
        }]
      },
      primitive: {
        topology: 'triangle-list'
      }
    }), makePipeline({
      label: 'Screensaver geometry',
      layout: 'auto',
      vertex: {
        module: shader,
        entryPoint: 'geometryVS',
        buffers: [{
          arrayStride: 24,
          attributes: [{
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2'
          }, {
            shaderLocation: 1,
            offset: 8,
            format: 'float32x4'
          }]
        }]
      },
      fragment: {
        module: shader,
        entryPoint: 'geometryFS',
        targets: [{
          format,
          blend
        }]
      },
      primitive: {
        topology: 'triangle-list'
      }
    })]);
    const validationError = await device.popErrorScope();
    if (validationError) throw new Error(validationError.message);
    if (generation !== this._generation || this._disposed) {
      device.destroy();
      throw new Error('Initialization superseded.');
    }
    gpu.uniform = device.createBuffer({
      label: '64-byte desktop uniforms',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    gpu.vertexCapacity = 1024 * 1024;
    gpu.vertices = device.createBuffer({
      label: 'Dynamic screensaver triangles',
      size: gpu.vertexCapacity,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    gpu.sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
    gpu.texture = device.createTexture({
      label: 'Desktop image',
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.writeTexture({
      texture: gpu.texture
    }, new Uint8Array([0, 0, 0, 255]), {
      bytesPerRow: 4
    }, [1, 1, 1]);
    this._gpuBindGroups();
    device.lost.then(info => {
      if (this._gpu === gpu && !this._disposed) this._recover(`WebGPU device lost: ${info.message || info.reason}`);
    });
    device.addEventListener('uncapturederror', event => {
      if (this._gpu === gpu && !this._disposed) this._recover(`WebGPU error: ${event.error?.message || 'unknown error'}`);
    });
  }
  _gpuBindGroups() {
    const g = this._gpu;
    g.backgroundBindGroup = g.device.createBindGroup({
      layout: g.background.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: {
          buffer: g.uniform
        }
      }, {
        binding: 1,
        resource: g.sampler
      }, {
        binding: 2,
        resource: g.texture.createView()
      }]
    });
    g.geometryBindGroup = g.device.createBindGroup({
      layout: g.geometry.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: {
          buffer: g.uniform
        }
      }]
    });
  }
  _initGL() {
    const gl = this._context('webgl2');
    if (!gl) throw new Error('WebGL2 is unavailable.');
    this._gl = gl;
    const program = (vertexCode, fragmentCode) => {
      const shaders = [[gl.VERTEX_SHADER, vertexCode], [gl.FRAGMENT_SHADER, fragmentCode]].map(([type, code]) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          throw new Error(message || 'WebGL shader compilation failed.');
        }
        return shader;
      });
      const output = gl.createProgram();
      shaders.forEach(shader => gl.attachShader(output, shader));
      gl.linkProgram(output);
      shaders.forEach(shader => gl.deleteShader(shader));
      if (!gl.getProgramParameter(output, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(output);
        gl.deleteProgram(output);
        throw new Error(message || 'WebGL program link failed.');
      }
      return output;
    };
    this._glBackground = program(GL_BACKGROUND_VERTEX, GL_BACKGROUND_FRAGMENT);
    this._glGeometry = program(GL_GEOMETRY_VERTEX, GL_GEOMETRY_FRAGMENT);
    this._glLocations = Object.fromEntries(['uViewport', 'uColor', 'uOptions', 'uImageSize', 'uImage'].map(name => [name, gl.getUniformLocation(this._glBackground, name)]));
    this._glGeometryViewport = gl.getUniformLocation(this._glGeometry, 'uViewport');
    this._glVertices = gl.createBuffer();
    this._glVao = gl.createVertexArray();
    gl.bindVertexArray(this._glVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._glVertices);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(null);
    this._glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this._glLost = event => {
      event.preventDefault();
      this._recover('WebGL2 context lost.');
    };
    this.canvas.addEventListener('webglcontextlost', this._glLost);
  }
  _initCanvas() {
    this._ctx = this._context('2d');
    if (!this._ctx) throw new Error('Canvas 2D is unavailable.');
  }
  _safeUploadImage() {
    this._imageReady = false;
    this._stats.imageError = '';
    if (!this._imageSource) return;
    try {
      let source = this._imageSource;
      let [width, height] = imageDimensions(source);
      const limit = this._gpu?.device.limits.maxTextureDimension2D || (this._gl ? this._gl.getParameter(this._gl.MAX_TEXTURE_SIZE) : 8192);
      if (Math.max(width, height) > limit) {
        const ratio = limit / Math.max(width, height),
          resized = document.createElement('canvas');
        resized.width = Math.max(1, Math.floor(width * ratio));
        resized.height = Math.max(1, Math.floor(height * ratio));
        resized.getContext('2d').drawImage(source, 0, 0, resized.width, resized.height);
        source = resized;
        [width, height] = imageDimensions(source);
      }
      this._imageSize = [width, height];
      if (this._gpu) {
        const g = this._gpu;
        const texture = g.device.createTexture({
          label: 'Uploaded desktop image',
          size: [width, height, 1],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        try {
          g.device.queue.copyExternalImageToTexture({
            source,
            flipY: false
          }, {
            texture,
            premultipliedAlpha: false
          }, [width, height]);
        } catch (error) {
          texture.destroy();
          throw error;
        }
        g.texture?.destroy();
        g.texture = texture;
        this._gpuBindGroups();
      } else if (this._gl) {
        const gl = this._gl;
        gl.bindTexture(gl.TEXTURE_2D, this._glTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL could not upload the image.');
      }
      this._imageReady = true;
    } catch (error) {
      this._stats.imageError = error.message || String(error);
    }
  }
  _resize() {
    if (this._disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || this.canvas.width || 800));
    const cssHeight = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || this.canvas.height || 600));
    const maximum = Math.min(4096, this._gpu?.device.limits.maxTextureDimension2D || 4096);
    const dpr = Math.max(.05, Math.min(globalThis.devicePixelRatio || 1, 1.75, maximum / cssWidth, maximum / cssHeight, Math.sqrt(3145728 / (cssWidth * cssHeight))));
    const width = Math.max(1, Math.round(cssWidth * dpr)),
      height = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this._width = cssWidth;
    this._height = cssHeight;
    this._dpr = dpr;
    Object.assign(this._stats, {
      width,
      height,
      dpr
    });
    this._dirty = true;
  }
  _invalidate() {
    this._dirty = true;
    if (this._disposed || this._initializing || this._idle || globalThis.document?.hidden || this._backend === 'uninitialized' || this._backend === 'unavailable') return;
    if (!this._raf) this._raf = requestAnimationFrame(time => this._tick(time));
  }
  _cancelFrame() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }
  _tick(time) {
    this._raf = 0;
    if (this._disposed || this._initializing || this._idle || globalThis.document?.hidden) return;
    const delta = Math.min(.1, Math.max(0, (time - this._lastTick) / 1000));
    this._lastTick = time;
    if (this._saver !== 'none') this._effectTime += delta;
    const targetFps = clamp(Number(this._saverOptions.fps) || 30, 10, 60);
    if (this._dirty || time - this._lastRender >= 1000 / targetFps - .8) {
      const start = now();
      try {
        const geometry = [];
        if (this._saver === 'starfield') makeStars(geometry, this._width, this._height, this._effectTime, this._saverOptions);else if (this._saver === 'mystify') makeMystify(geometry, this._width, this._height, this._effectTime, this._saverOptions);else if (this._saver === 'pipes') makePipes(geometry, this._width, this._height, this._effectTime, this._saverOptions, this._pipeCache);
        this._uniforms.set([this.canvas.width, this.canvas.height, this._effectTime, this._dpr, ...this._base, 1, WALLPAPER_PATTERNS.indexOf(this._wallpaper.pattern), SCREENSAVERS.indexOf(this._saver), this._imageReady ? 1 : 0, FITS.indexOf(this._wallpaper.fit), ...this._imageSize, 0, 0]);
        if (this._gpu) this._renderGPU(geometry);else if (this._gl) this._renderGL(geometry);else if (this._ctx) this._renderCanvas(geometry);
        this._stats.frames++;
        this._stats.drawCalls = geometry.length ? 2 : 1;
        this._stats.frameTime = this._stats.frames === 1 ? now() - start : this._stats.frameTime * .85 + (now() - start) * .15;
        this._stats.fps = this._saver !== 'none' && this._lastRender ? Math.round(1000 / Math.max(1, time - this._lastRender)) : 0;
        this._lastRender = time;
        this._dirty = false;
      } catch (error) {
        this._recover(`Rendering failed: ${error.message || error}`);
        return;
      }
    }
    if (this._saver !== 'none') this._raf = requestAnimationFrame(next => this._tick(next));
  }
  _renderGPU(vertices) {
    const g = this._gpu,
      device = g.device;
    device.queue.writeBuffer(g.uniform, 0, this._uniforms);
    if (vertices.length) {
      const array = new Float32Array(vertices);
      if (array.byteLength > g.vertexCapacity) {
        g.vertices.destroy();
        g.vertexCapacity = Math.ceil(array.byteLength / 65536) * 65536;
        g.vertices = device.createBuffer({
          label: 'Dynamic screensaver triangles',
          size: g.vertexCapacity,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
      }
      device.queue.writeBuffer(g.vertices, 0, array);
    }
    const encoder = device.createCommandEncoder({
      label: 'Desktop frame'
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: g.context.getCurrentTexture().createView(),
        clearValue: {
          r: 0,
          g: 0,
          b: 0,
          a: 1
        },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });
    pass.setPipeline(g.background);
    pass.setBindGroup(0, g.backgroundBindGroup);
    pass.draw(3);
    if (vertices.length) {
      pass.setPipeline(g.geometry);
      pass.setBindGroup(0, g.geometryBindGroup);
      pass.setVertexBuffer(0, g.vertices);
      pass.draw(vertices.length / 6);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  _renderGL(vertices) {
    const gl = this._gl,
      u = this._uniforms,
      locations = this._glLocations;
    if (gl.isContextLost()) throw new Error('WebGL context is lost.');
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.useProgram(this._glBackground);
    gl.uniform4fv(locations.uViewport, u.subarray(0, 4));
    gl.uniform4fv(locations.uColor, u.subarray(4, 8));
    gl.uniform4fv(locations.uOptions, u.subarray(8, 12));
    gl.uniform4fv(locations.uImageSize, u.subarray(12, 16));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._glTexture);
    gl.uniform1i(locations.uImage, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (vertices.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this._glGeometry);
      gl.uniform4fv(this._glGeometryViewport, u.subarray(0, 4));
      gl.bindVertexArray(this._glVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._glVertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
      gl.bindVertexArray(null);
    }
  }
  _renderCanvas(vertices) {
    const ctx = this._ctx,
      width = this._width,
      height = this._height;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (this._saver !== 'none') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    } else {
      const pattern = WALLPAPER_PATTERNS.indexOf(this._wallpaper.pattern);
      ctx.fillStyle = `rgb(${this._base.map(c => Math.round(c * 255)).join(',')})`;
      ctx.fillRect(0, 0, width, height);
      if (pattern) {
        if (!this._tileCache) {
          const tile = document.createElement('canvas');
          tile.width = tile.height = 256;
          const tc = tile.getContext('2d');
          const data = tc.createImageData(256, 256);
          for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
            const color = wallpaperPixel(x, y, pattern, this._base),
              offset = (y * 256 + x) * 4;
            for (let c = 0; c < 3; c++) data.data[offset + c] = Math.round(color[c] * 255);
            data.data[offset + 3] = 255;
          }
          tc.putImageData(data, 0, 0);
          this._tileCache = tile;
        }
        ctx.fillStyle = ctx.createPattern(this._tileCache, 'repeat');
        ctx.fillRect(0, 0, width, height);
      }
      if (this._imageReady && this._imageSource) {
        const [iw, ih] = imageDimensions(this._imageSource),
          fit = this._wallpaper.fit;
        if (fit === 'tile') {
          ctx.fillStyle = ctx.createPattern(this._imageSource, 'repeat');
          ctx.fillRect(0, 0, width, height);
        } else if (fit === 'stretch') ctx.drawImage(this._imageSource, 0, 0, width, height);else {
          const scale = fit === 'center' ? 1 : fit === 'contain' ? Math.min(width / iw, height / ih) : Math.max(width / iw, height / ih);
          ctx.drawImage(this._imageSource, (width - iw * scale) / 2, (height - ih * scale) / 2, iw * scale, ih * scale);
        }
      }
    }
    for (let offset = 0; offset < vertices.length; offset += 18) {
      const r = (vertices[offset + 2] + vertices[offset + 8] + vertices[offset + 14]) / 3;
      const g = (vertices[offset + 3] + vertices[offset + 9] + vertices[offset + 15]) / 3;
      const b = (vertices[offset + 4] + vertices[offset + 10] + vertices[offset + 16]) / 3;
      ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      ctx.globalAlpha = vertices[offset + 5];
      ctx.beginPath();
      ctx.moveTo(vertices[offset], vertices[offset + 1]);
      ctx.lineTo(vertices[offset + 6], vertices[offset + 7]);
      ctx.lineTo(vertices[offset + 12], vertices[offset + 13]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  async _recover(reason) {
    if (this._disposed || this._recovering) return;
    this._recovering = true;
    this._stats.fallbackReason = reason;
    this._freshContext = true;
    const next = this._backend === 'webgpu' ? 'webgl2' : 'canvas2d';
    try {
      await this.init(next);
    } catch (error) {
      this._stats.fallbackReason = `${reason} ${error.message || error}`;
      this._notifyBackend();
    } finally {
      this._recovering = false;
    }
  }
  _teardownBackend() {
    const gpu = this._gpu;
    this._gpu = null;
    if (gpu) {
      try {
        gpu.context.unconfigure();
      } catch {/* A lost context is already unusable. */}
      try {
        gpu.uniform?.destroy();
        gpu.vertices?.destroy();
        gpu.texture?.destroy();
        gpu.device.destroy();
      } catch {/* Device destruction is best effort after loss. */}
    }
    const gl = this._gl;
    if (gl) {
      this.canvas.removeEventListener('webglcontextlost', this._glLost);
      gl.deleteProgram(this._glBackground);
      gl.deleteProgram(this._glGeometry);
      gl.deleteBuffer(this._glVertices);
      gl.deleteTexture(this._glTexture);
      gl.deleteVertexArray(this._glVao);
    }
    this._gl = null;
    this._ctx = null;
    this._imageReady = false;
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    ++this._generation;
    ++this._imageSerial;
    this._cancelFrame();
    this._teardownBackend();
    this._resizeObserver?.disconnect();
    globalThis.removeEventListener?.('resize', this._onResize);
    globalThis.document?.removeEventListener('visibilitychange', this._onVisibility);
    this._imageSource = null;
    this._tileCache = null;
    this._pipeCache = {};
    this._backend = 'disposed';
    this._stats.backend = 'disposed';
  }
}
export default DesktopRenderer;
