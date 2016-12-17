'use strict';

const EDGES_HEIGHT = 100;
const LINES_SIZE = 200;

async(function *main() {
  const edgeThresholdElt = document.getElementById('edgeThreshold'),
      edgeThresholdOutElt = document.getElementById('edgeThresholdOut'),
      lineThresholdElt = document.getElementById('lineThreshold'),
      lineThresholdOutElt = document.getElementById('lineThresholdOut'),
      clusterThresholdElt = document.getElementById('clusterThreshold'),
      clusterThresholdOutElt = document.getElementById('clusterThresholdOut'),
      timingOutElt = document.getElementById('timingOut'),
      colorsOutElt = document.getElementById('colorsOut');
  const stream = yield navigator.mediaDevices.getUserMedia({
    video: true,
  });
  // TODO: Could there be more than 1 track?
  // const settings = stream.getVideoTracks()[0].getSettings();
  let settings;
  const videoTracks = stream.getVideoTracks();
  if (videoTracks[0] && videoTracks[0].getSettings)
    settings = videoTracks[0].getSettings();
  const videoElt = document.createElement('video');
  videoElt.autoplay = true;
  videoElt.srcObject = stream;
  document.body.append(videoElt);

  if (!settings) {
    yield new Promise(_ => videoElt.addEventListener('playing', _));
    settings = {width: videoElt.videoWidth, height: videoElt.videoHeight};
  }
  console.log(settings);

  const scaleFactor = EDGES_HEIGHT / settings.height;
  const canvasElt = document.createElement('canvas');
  canvasElt.mozOpaque = true;
  canvasElt.width = Math.round(scaleFactor * settings.width);
  canvasElt.height = EDGES_HEIGHT;
  document.body.append(canvasElt);
  const context = canvasElt.getContext('2d');
  const canvasElt2 = document.createElement('canvas');
  canvasElt2.mozOpaque = true;
  canvasElt2.width = LINES_SIZE;
  canvasElt2.height = LINES_SIZE;
  document.body.append(canvasElt2);
  const context2 = canvasElt2.getContext('2d');
  const canvasElt3 = document.createElement('canvas');
  canvasElt3.mozOpaque = true;
  canvasElt3.width = settings.width;
  canvasElt3.height = settings.height;
  document.body.append(canvasElt3);
  const context3 = canvasElt3.getContext('2d');
  setTimeout(function update() {
    const edgeThreshold = edgeThresholdElt.value,
        lineThreshold = lineThresholdElt.value,
        clusterThreshold = clusterThresholdElt.value;
    context.drawImage(videoElt, 0, 0, canvasElt.clientWidth, canvasElt.clientHeight);
    const frame = context.getImageData(0, 0, canvasElt.clientWidth, canvasElt.clientHeight),
        output = context.createImageData(frame.width, frame.height);
    const startTime = performance.now();
    detectEdges(output, frame, edgeThreshold);
    const endTime = performance.now();
    context.putImageData(output, 0, 0);
    const output2 = context2.createImageData(LINES_SIZE, LINES_SIZE);
    const startTime2 = performance.now();
    const lines = detectLines(output2, output, lineThreshold);
    const endTime2 = performance.now();
    context2.putImageData(output2, 0, 0);
    const startTime3 = performance.now();
    const clusters = clusterLines(lines, clusterThreshold);
    const endTime3 = performance.now();
    /*
    for (const [index, cluster] of clusters.entries())
      for (const line of cluster)
        plotLine(line, 1, hueToRgb(index / clusters.length), 0.2);
    */
    // const clusters2 = clusters.map(_ => _.reduce((a, b) => a[2] > b[2] ? a : b));
    const clusters2 = clusters.map(lineAverage);
    for (const [index, line] of clusters2.entries())
      plotLine(line, 2, [128, 128, 128]);
    const startTime4 = performance.now();
    const grid = detectGrid(clusters2, 0.2, 20, 4);
    const endTime4 = performance.now();
    for (const [index, parallels] of grid.entries())
      for (const line of Object.values(parallels))
        plotLine(line, 2, hueToRgb(index / grid.length));
    if (grid.length === 2 && grid[0].length === 4 && grid[1].length === 4) {
      const quads = gridToQuads(grid[0], grid[1]),
          inView = quads.every(_ => _.every(_ => _.some(_ =>
            _[0] >= 0 && _[0] < frame.width && _[1] >= 0 && _[1] < frame.height
          )));
      /*
      const canvasElt3 = document.createElement('canvas');
      canvasElt3.mozOpaque = true;
      canvasElt3.width = settings.width;
      canvasElt3.height = settings.height;
      // document.body.append(canvasElt3);
      const context3 = canvasElt3.getContext('2d');
      context3.drawImage(videoElt, 0, 0, settings.width, settings.height);
      const frame2 = context3.getImageData(0, 0, settings.width, settings.height);
      */
      context3.drawImage(videoElt, 0, 0, canvasElt3.clientWidth, canvasElt3.clientHeight);
      const frame2 = context3.getImageData(0, 0, canvasElt3.clientWidth, canvasElt3.clientHeight);
      const colors = sampleGrid(frame2, grid, scaleFactor);
      context3.putImageData(frame2, 0, 0);

      if (inView) {
        quads.forEach(_ => _.forEach(quad => {
          const scaleInv = 1 / scaleFactor;
          for (let i = 0; i < quad.length; ++i)
            quad[i][0] *= scaleInv, quad[i][1] *= scaleInv;
          scale(quad, 0.8);
          context3.beginPath();
          context3.moveTo(quad[0][0], quad[0][1]);
          for (let i = 1; i < quad.length; ++i)
            context3.lineTo(quad[i][0], quad[i][1]);
          context3.closePath();
          const hue = samplePath(context3, frame, clipBox(boundingBox(quad), frame.width, frame.height));
          context3.fillStyle = (() => {
            switch (hue) {
              case 'black': return 'black';
              case 'white': return 'white';
              default:      return `rgb(${hueToRgb(hue)},1)`;
            }
          })();
          context3.fill();
        }));
      }

      // context.drawImage(canvasElt3, 0, 0, canvasElt.clientWidth, canvasElt.clientHeight);
      colorsOutElt.innerHTML = '';
      for (let i = 0; i < colors.length; ++i) {
        const row = colors[i],
            rowElt = document.createElement('tr');
        for (let j = 0; j < row.length; ++j) {
          const cellElt = document.createElement('td');
          cellElt.style.width = cellElt.style.height = '20px';
          cellElt.style.background = `rgb(${row[j] || [0, 0, 0]})`;
          rowElt.appendChild(cellElt);
        }
        colorsOutElt.appendChild(rowElt);
      }
    }
    edgeThresholdOutElt.innerText = edgeThreshold;
    lineThresholdOutElt.innerText = lineThreshold;
    clusterThresholdOutElt.innerText = clusterThreshold;
    timingOutElt.innerText = `edges: ${Math.round(endTime - startTime)} ms | lines: ${Math.round(endTime2 - startTime2)} ms (${lines.length}) | clusters: ${Math.round(endTime3 - startTime3)} ms (${clusters.length}) | grid ${Math.round(endTime4 - startTime4)} ms (${grid.map(_ => _.length)})`;
    setTimeout(update, 10);

    function plotLine(line, width = 1, color = [0, 0, 0], alpha = 1) {
      context.beginPath();
      const cos = Math.cos(line[0]), sin = Math.sin(line[0]),
          t = Math.max(frame.width, frame.height);
      context.moveTo(-cos * t - sin * line[1], -sin * t + cos * line[1]);
      context.lineTo(cos * t - sin * line[1], sin * t + cos * line[1]);
      context.lineWidth = width;
      context.strokeStyle = `rgba(${color},${alpha})`;
      context.stroke();
    }
  }, 0);
})();

function detectEdges(output, input, threshold = 20) {
  const {width, height} = input;
  for (let offset = 0, y = 0; y < height; ++y)
    for (let x = 0; x < width; ++x, offset += 4) {
      let edge = false;
      if (y > 0 && y < height - 1 && x > 0 && x < width - 1) {
        const pixel = readPixel(input.data, offset);
        const neighbours = [
          offset - width * 4,
          offset - 4,
          offset + 4,
          offset + width * 4,
        ];
        edge = Math.max(...neighbours.map(_ => readPixel(input.data, _)).map(_ => colorDistance(pixel, _))) >= threshold;
      }
      output.data[offset] = output.data[offset + 1] = output.data[offset + 2] = edge ? 0 : 255;
      output.data[offset + 3] = 255;
    }
}

function detectLines(output, input, threshold = 0.6, minContribution = 10) {
  const {width, height} = input,
      {width: angleSteps, height: distanceSteps} = output,
      diagonal = Math.hypot(width, height),
      angleScale = Math.PI / angleSteps,
      distanceScale = distanceSteps / (diagonal * 2),
      angleVectors = Array(angleSteps);
  for (let i = 0, theta = 0; i < angleSteps; ++i, theta += angleScale) {
    const cos = Math.cos(theta), sin = Math.sin(theta);
    angleVectors[i] = [cos, sin, sin ? cos / sin : 0, cos ? sin / cos : 0];
  }
  const total = Array(angleSteps * distanceSteps).fill(0),
      accumulator = Array(angleSteps * distanceSteps).fill(0);
  for (let offset = 0, y = 0; y < height; ++y)
    for (let x = 0; x < width; ++x, offset += 4)
      for (let i = 0; i < angleSteps; ++i) {
        const angleVector = angleVectors[i];
        const d = angleVector[0] * y - angleVector[1] * x;
        // const offset = d * (d >= 0 ? angleVector[3] : angleVector[2]);
        let j = Math.round(d * distanceScale + distanceSteps / 2);
        if (j < 0) {
          console.log('j < 0', j);
          j = 0;
        }
        if (j >= distanceSteps) {
          console.log('j >= distanceSteps', j, distanceSteps);
          j = distanceSteps - 1;
        }
        const index = j * angleSteps + i;
        ++total[index];
        if (!input.data[offset])
          ++accumulator[index];
      }
  const lines = [];
  for (let index = 0, j = 0; j < distanceSteps; ++j)
    for (let i = 0; i < angleSteps; ++i, ++index) {
      const offset = index * 4;
      if (total[index]) {
        const value = accumulator[index] / total[index];
        const hit = total[index] >= minContribution && value >= threshold;
        if (hit)
          lines.push([i, j, value]);
        output.data[offset] = output.data[offset + 1] = output.data[offset + 2] = Math.floor(value / threshold * 256);
        if (hit)
          output.data[offset + 1] = 0
      }
      else
        [output.data[offset], output.data[offset + 1], output.data[offset + 2]] = [255, 0, 0];
      output.data[offset + 3] = 255;
    }
  return lines.map(_ => [_[0] * angleScale, (_[1] - distanceSteps / 2) / distanceScale, _[2]])
    .sort((a, b) => b[2] - a[2]);
}

function clusterLines(lines, threshold) {
  const clusters = [],
      size = lines.length,
      clusterMap = Array(size);
  outer: for (var i = 0; i < size; ++i) {
    for (var j = 0; j < i; ++j)
      if (lineDistance(lines[i], lines[j]) <= threshold) {
        (clusterMap[i] = clusterMap[j]).push(i);
        continue outer;
      }
    clusters.push(clusterMap[i] = [i]);
  }
  // return clusters.map(cluster => lineAverage(cluster.map(_ => lines[_])));
  return clusters.map(cluster => cluster.map(_ => lines[_]));
}

function detectGrid(lines, angleThreshold, distanceThreshold, minParallels) {
  const grid = [];
  for (const line of lines) {
    const mates = lines.filter(_ => angleDistance(_[0], line[0]) <= angleThreshold);
    mateLoop: for (const mate of mates) {
      if (mate === line)
        continue;
      let d = Math.abs(line[0] - mate[0]) <= Math.PI / 2 ? line[1] - mate[1] : line[1] + mate[1];
      if (d <= 0)
        continue;
      const parallels = [];
      let count = 0;
      for (const parallel of mates) {
        const d2 = Math.abs(line[0] - parallel[0]) <= Math.PI / 2 ? line[1] - parallel[1] : line[1] + parallel[1];
        // const d2 = line[1] - parallel[1];
        if (d2 < 0)
          continue;
        const t = d2 / d,
            i = Math.round(t);
        if (Math.abs(t - i) <= distanceThreshold && !parallels[i])
          parallels[i] = parallel, ++count;
      }
      if (count < minParallels)
        continue;
      for (let i = 0; i < minParallels; ++i)
        if (!parallels[i])
          continue mateLoop;
      grid.push(parallels);
    }
  }
  return grid;
}

function gridToQuads(xLines, yLines) {
  const points = Array(xLines.length);
  for (const [i, xLine] of xLines.entries()) {
    points[i] = Array(yLines.length);
    for (const [j, yLine] of yLines.entries())
      points[i][j] = intersect(xLine, yLine);
  }
  const quads = Array(xLines.length - 1);
  for (let i = 0; i < xLines.length - 1; ++i) {
    quads[i] = Array(yLines.length - 1)
    for (let j = 0; j < yLines.length - 1; ++j)
      quads[i][j] = [
        Array.from(points[i][j]),
        Array.from(points[i][j + 1]),
        Array.from(points[i + 1][j + 1]),
        Array.from(points[i + 1][j])
      ];
  }
  return quads;
}

function samplePath(context, input, boundingBox) {
  const chromaThreshold = 0.2;
  let count = 0, black = 0, white = 0, hues = [];
  for (const [x, y, p] of getPathPixels(context, input, boundingBox)) {
    const [hue, chroma, lightness] = rgbToHcl(...p.map(_ => _ / 255));
    if (chroma < chromaThreshold) {
      if (lightness < 0.5)
        ++black;
      else
        ++white;
    } else
      hues.push(hue);
    ++count;
  }
  console.log(count, black, white, hues.length, angleAverage(hues.map(_ => _ * Math.PI * 2)) / (Math.PI * 2));
  if (black >= count / 2)
    return 'black';
  if (white >= count / 2)
    return 'white';
  return angleAverage(hues.map(_ => _ * Math.PI * 2)) / (Math.PI * 2);
}

function *getPathPixels(context, input, boundingBox) {
  for (let y = boundingBox[1]; y < boundingBox[3]; ++y)
    for (let x = boundingBox[0], offset = y * input.width * 4 + x; x < boundingBox[2]; ++x, offset += 4)
      if (context.isPointInPath(x, y))
        yield [x, y, readPixel(input.data, offset)];
}

function sampleGrid(input, grid, scaleFactor) {
  const {width, height} = input,
      colors = Array(grid[0].length - 1);
  for (let i = 0; i < grid[0].length - 1; ++i) {
    colors[i] = Array(grid[1].length - 1)
    for (let j = 0; j < grid[1].length - 1; ++j)
      colors[i][j] = [0, 0, 0, 0];
  }
  const angleVectors = grid.map(_ => _.map(line => [Math.cos(line[0]), Math.sin(line[0])]));
  for (let offset = 0, y = 0; y < height; ++y)
    for (let x = 0; x < width; ++x, offset += 4) {
      const coordinates = [];
      for (const [index, parallels] of grid.entries()) {
        coordinates[index] = -1;
        for (const [index2, lines] of parallels.entries()) {
          const angleVector = angleVectors[index][index2],
              d = angleVector[0] * y - angleVector[1] * x;
          // TODO: Fix inequality.
          if (d * scaleFactor < lines[1])
            coordinates[index] = index2;
        }
      }
      const [i, j] = coordinates;
      if (i < 0 || i >= grid[0].length - 1 || j < 0 || j >= grid[1].length - 1) {
        /*
        input.data[offset] = 0;
        input.data[offset + 1] = 0;
        input.data[offset + 2] = 0;
        input.data[offset + 3] = 255;
        */
        continue;
      }
      const color = colors[i][j];
      color[0] += input.data[offset];
      color[1] += input.data[offset + 1];
      color[2] += input.data[offset + 2];
      ++color[3];

      const foo = hueToRgb((j * (grid[0].length - 1) + i) / ((grid[0].length - 1) * (grid[1].length - 1)));
      input.data[offset] = foo[0];
      input.data[offset + 1] = foo[1];
      input.data[offset + 2] = foo[2];
      input.data[offset + 3] = 255;
    }
  return colors.map(_ => _.map(_ => _[3]
      ? [Math.round(_[0] / _[3]), Math.round(_[1] / _[3]), Math.round(_[2] / _[3])]
      : undefined));
}

function intersect(line1, line2) {
  const detInv = 1 / Math.sin(line2[0] - line1[0]);
  return [
    detInv * (Math.cos(line2[0]) * line1[1] - Math.cos(line1[0]) * line2[1]),
    detInv * (Math.sin(line2[0]) * line1[1] - Math.sin(line1[0]) * line2[1]),
  ];
}

function scale(points, factor) {
  if (!points.length)
    return;
  const centroid = [0, 0];
  for (const point of points) {
    centroid[0] += point[0];
    centroid[1] += point[1];
  }
  const a = (1 - factor) / points.length;
  centroid[0] *= a;
  centroid[1] *= a;
  for (const point of points) {
    point[0] = point[0] * factor + centroid[0];
    point[1] = point[1] * factor + centroid[1];
  }
}

function boundingBox(points) {
  const xs = points.map(_ => _[0]),
      ys = points.map(_ => _[1]);
  return [
    Math.floor(Math.min(...xs)),
    Math.floor(Math.min(...ys)),
    Math.floor(Math.max(...xs)),
    Math.floor(Math.max(...ys)),
  ];
}

function clipBox(box, width, height) {
  if (box[0] >= width || box[1] >= height || box[2] < 0 || box[3] < 0)
    return [Infinity, Infinity, -Infinity, -Infinity];
  return [
    Math.max(box[0], 0),
    Math.max(box[1], 0),
    Math.min(box[2], width),
    Math.min(box[3], height),
  ];
}

function lineAverage(lines) {
  let angles = lines.map(_ => _[0]);
  if (Math.max(...angles) - Math.min(...angles) < Math.PI / 2)
    return average(lines);
  const transformed = lines.map(_ => _[0] < Math.PI / 2
      ? [_[0] + Math.PI / 2, -_[1], _[2]]
      : [_[0] - Math.PI / 2, _[1], _[2]]),
      result = average(transformed);
  angles = transformed.map(_ => _[0]);
  if (Math.max(...angles) - Math.min(...angles) >= Math.PI / 2)
    throw 'Wide average';
  return result[0] < Math.PI / 2
      ? [result[0] + Math.PI / 2, result[1], result[2]]
      : [result[0] - Math.PI / 2, -result[1], result[2]];

  function average(lines) {
    const sum = [0, 0, 0];
    for (const line of lines) {
      sum[0] += line[2] * line[0];
      sum[1] += line[2] * line[1];
      sum[2] += line[2];
    }
    return [sum[0] / sum[2], sum[1] / sum[2], sum[2]];
  }
}

function lineDistance(line1, line2, scale = 100) {
  const da1 = Math.abs(line1[0] - line2[0]),
    dd1 = line1[1] - line2[1],
    da2 = da1 - Math.PI,
    dd2 = line1[1] + line2[1],
    d1 = Math.hypot(da1, dd1 / scale),
    d2 = Math.hypot(da2, dd2 / scale);
  return Math.min(d1, d2);
}

function angleAverage(angles) {
  if (Math.max(...angles) - Math.min(...angles) < Math.PI)
    return average(angles);
  const transformed = angles.map(_ => _ < Math.PI
      ? _ + Math.PI
      : _ - Math.PI),
      result = average(transformed);
  if (Math.max(...transformed) - Math.min(...transformed) >= Math.PI)
    throw 'Wide average';
  return result < Math.PI
      ? result + Math.PI
      : result - Math.PI;

  function average(angles) {
    return angles.reduce((a, b) => a + b, 0) / angles.length;
  }
}

function angleDistance(angle1, angle2) {
  const d = Math.abs(angle1 - angle2);
  return d <= Math.PI / 2 ? d : Math.PI - d;
}

function colorDistance(color1, color2) {
  return Math.hypot(color1[0] - color2[0], color1[1] - color2[1], color1[2] - color2[2]);
}

function readPixel(bitmap, offset) {
  return [bitmap[offset], bitmap[offset + 1], bitmap[offset + 2]];
}

function rgbToHcl(red, green, blue) {
  const min = Math.min(red, green, blue),
      max = Math.max(red, green, blue),
      chroma = max - min,
      chroma6 = chroma * 6,
      hue = (() => {
        switch (max) {
          case red:   const h = (green - blue) / chroma6; return h >= 0 ? h : h + 1;
          case green: return (blue - red) / chroma6 + 1 / 3;
          case blue:  return (red - green) / chroma6 + 2 / 3;
        }
      })(),
      lightness = (min + max) / 2;
  return [hue, chroma, lightness];
}

function hueToRgb(hue) {
  hue = (hue % 1) * 6;
  const sextant = Math.floor(hue),
      t = Math.floor((hue - sextant) * 256);
  switch (sextant) {
    case 0: return [255, t, 0];
    case 1: return [255 - t, 255, 0];
    case 2: return [0, 255, t];
    case 3: return [0, 255 - t, 255];
    case 4: return [t, 0, 255];
    case 5: return [255, 0, 255 - t];
  }
}

/*
function getVideo() {
  return new Promise((resolve, reject) =>
    navigator.mediaDevices.getUserMedia({
      video: true,
    }, resolve, reject));
}
*/

function async(generatorFn) {
  const wrapped = function(...args) {
    const generator = generatorFn.apply(this, args);
    try {
      return handleYield(generator.next());
    } catch (e) {
      return Promise.reject(e);
    }
    function handleYield(item) {
      const value = Promise.resolve(item.value);
      if (item.done)
        return value;
      else
        return value.then(
          _ => handleYield(generator.next(_)),
          _ => handleYield(generator.throw(_))
        );
    }
  }
  const {length, name} = generatorFn;
  return Object.defineProperties(wrapped, {
    length: {
      configurable: true,
      enumerable: false,
      writable: false,
      value: Number.isSafeInteger(length) && length >= 0 && !Object.is(length, -0) ? length : 0,
    },
    name: {
      configurable: true,
      enumerable: false,
      writable: false,
      value: typeof name === 'string' ? name : '',
    },
  });
}

function dump(value, short = false) {
  switch (typeOf(value)) {
    case 'string':
      console.log(dumpString(value));
      break;
    case 'symbol':
      console.log(dumpSymbol(value));
      break;
    case 'object': {
      let protoChain = [], text = '', object = value;
      for (;;) {
        protoChain.push(object);
        text += dumpObject(object);
        object = Object.getPrototypeOf(object);
        if (object === null)
          break;
        text += ' -> ';
      }
      console.log(text);
      if (short)
        break;
      let hidden = new Set();
      for (const object of protoChain) {
        const properties = Object.getOwnPropertyDescriptors(object);
        for (const key of Reflect.ownKeys(properties)) {
          if (hidden.has(key))
            continue;
          hidden.add(key);
          const descriptor = properties[key];
          let text = '  ' + (typeof key === 'string' ? dumpString(key) : dumpSymbol(key));
          let flags = '', text2 = '';
          if (!descriptor.configurable)
            flags += 'C';
          if (!descriptor.enumerable)
            flags += 'E';
          if (descriptor.get || descriptor.set) {
            flags += 'A';
            if (!descriptor.get)
              flags += 'W';
            if (!descriptor.set)
              flags += 'R';
            if (descriptor.get) {
              let result, exception = false;
              try {
                result = descriptor.get.call(value);
              } catch (e) {
                result = e;
                exception = true;
              }
              text2 += ' = ' + (exception ? 'exception ' : '') + dumpShort(result) + ' (';
              if (descriptor.get)
                text2 += dumpShort(descriptor.get);
              text2 += ' | ';
              if (descriptor.set)
                text2 += dumpShort(descriptor.set);
              text2 += ')';
            }
          } else {
            if (!descriptor.writable)
              flags += 'R';
            text2 += ' = ' + dumpShort(descriptor.value);
          }
          console.log(text + (flags ? ` [${flags}]` : '') + text2);
        }
        console.log('-'.repeat(50));
      }
    } break;
    default:
      console.log(value);
  }
}

function dumpShort(value) {
  switch (typeOf(value)) {
    case 'string': return dumpString(value);
    case 'symbol': return dumpSymbol(value);
    case 'object': return dumpObject(value);
    default:       return value + '';
  }
}

function dumpString(string) {
  return '"' + string.replace(/[^!#-[\]-~]/g, c => {
    switch (c) {
      case '\b': return '\\b';
      case '\t': return '\\t';
      case '\n': return '⏎';
      case '\v': return '\\v';
      case '\f': return '\\f';
      case '\r': return '\\r';
      case '"':
      case '\\': return '\\' + c;
      case ' ':  return '·';
    }
    c = c.charCodeAt(0);
    if (c < 32)
      return String.fromCharCode(0x2400 + c);
    if (c === 127)
      return '␡';
    if (c < 256)
      return '\\x' + c.toString(16);
    return '\\u' + ('0' + c.toString(16)).slice(-4);
  }) + '"';
}

function dumpSymbol(symbol) {
  switch (symbol) {
    case Symbol.hasInstance:        return '@@hasInstance';
    case Symbol.isConcatSpreadable: return '@@isConcatSpreadable';
    case Symbol.iterator:           return '@@iterator';
    case Symbol.match:              return '@@match';
    case Symbol.replace:            return '@@replace';
    case Symbol.search:             return '@@search';
    case Symbol.species:            return '@@species';
    case Symbol.split:              return '@@split';
    case Symbol.toPrimitive:        return '@@toPrimitive';
    case Symbol.toStringTag:        return '@@toStringTag';
    case Symbol.unscopables:        return '@@unscopables';
  }
  const key = Symbol.keyFor(symbol);
  if (key !== undefined)
    return `Symbol.for(${dumpString(key)})`;
  const description = Symbol.prototype.toString.call(symbol).slice(7, -1);
  return `symbol(${dumpString(description)})`;
}

function dumpObject(object) {
  const stringIteratorPrototype = Object.getPrototypeOf(''[Symbol.iterator]()),
      arrayIteratorPrototype = Object.getPrototypeOf([][Symbol.iterator]()),
      typedArray = Object.getPrototypeOf(Uint8Array),
      mapIteratorPrototype = Object.getPrototypeOf(new Map()[Symbol.iterator]()),
      setIteratorPrototype = Object.getPrototypeOf(new Set()[Symbol.iterator]()),
      iteratorPrototype = Object.getPrototypeOf(stringIteratorPrototype),
      generator = Object.getPrototypeOf(function *() {}),
      generatorFunction = generator.constructor,
      strictArguments = function() { 'use strict'; return arguments; }();
  const standardObjects = {
    eval, isFinite, isNaN, parseFloat, parseInt,
    decodeURI, decodeURIComponent, encodeURI, encodeURIComponent,
    escape, unescape,  // Annex B
    Boolean, Number, String, Symbol,
    Object, Function, Array, RegExp, Date,
    Map, Set, WeakMap, WeakSet,
    Proxy, Promise,
    Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError,
    ArrayBuffer, DataView,
    Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
    Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array,
    Reflect, Math, JSON,
    'Object.assign': Object.assign,
    'Object.create': Object.create,
    'Object.defineProperties': Object.defineProperties,
    'Object.defineProperty': Object.defineProperty,
    'Object.entries': Object.entries,  // ES2017
    'Object.freeze': Object.freeze,
    'Object.getOwnPropertyDescriptor': Object.getOwnPropertyDescriptor,
    'Object.getOwnPropertyDescriptors': Object.getOwnPropertyDescriptors,  // ES2017
    'Object.getOwnPropertyNames': Object.getOwnPropertyNames,
    'Object.getOwnPropertySymbols': Object.getOwnPropertySymbols,
    'Object.getPrototypeOf': Object.getPrototypeOf,
    'Object.is': Object.is,
    'Object.isExtensible': Object.isExtensible,
    'Object.isFrozen': Object.isFrozen,
    'Object.isSealed': Object.isSealed,
    'Object.keys': Object.keys,
    'Object.preventExtensions': Object.preventExtensions,
    'Object.prototype': Object.prototype,
    'Object.seal': Object.seal,
    'Object.setPrototypeOf': Object.setPrototypeOf,
    'Object.values': Object.values,  // ES2017
    'Object#hasOwnProperty': Object.prototype.hasOwnProperty,
    'Object#isPrototypeOf': Object.prototype.isPrototypeOf,
    'Object#propertyIsEnumerable': Object.prototype.propertyIsEnumerable,
    'Object#toLocaleString': Object.prototype.toLocaleString,
    'Object#toString': Object.prototype.toString,
    'Object#valueOf': Object.prototype.valueOf,
    'Object#get __proto__': Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').get,  // Annex B
    'Object#set __proto__': Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').set,  // Annex B
    'Function.prototype': Function.prototype,
    'Function#apply': Function.prototype.apply,
    'Function#bind': Function.prototype.bind,
    'Function#call': Function.prototype.call,
    'Function#toString': Function.prototype.toString,
    'Function#@@hasInstance': Function.prototype[Symbol.hasInstance],
    'Boolean.prototype': Boolean.prototype,
    'Boolean#toString': Boolean.prototype.toString,
    'Boolean#valueOf': Boolean.prototype.valueOf,
    'Symbol.for': Symbol.for,
    'Symbol.keyFor': Symbol.keyFor,
    'Symbol.prototype': Symbol.prototype,
    'Symbol#toString': Symbol.prototype.toString,
    'Symbol#valueOf': Symbol.prototype.valueOf,
    'Symbol#@@toPrimitive': Symbol.prototype[Symbol.toPrimitive],
    'Error.prototype': Error.prototype,
    'Error#toString': Error.prototype.toString,
    'EvalError.prototype': EvalError.prototype,
    'RangeError.prototype': RangeError.prototype,
    'ReferenceError.prototype': ReferenceError.prototype,
    'SyntaxError.prototype': SyntaxError.prototype,
    'TypeError.prototype': TypeError.prototype,
    'URIError.prototype': URIError.prototype,
    'Number.isFinite': Number.isFinite,
    'Number.isInteger': Number.isInteger,
    'Number.isNaN': Number.isNaN,
    'Number.isSafeInteger': Number.isSafeInteger,
    'Number.prototype': Number.prototype,
    'Number#toExponential': Number.prototype.toExponential,
    'Number#toFixed': Number.prototype.toFixed,
    'Number#toLocaleString': Number.prototype.toLocaleString,
    'Number#toPrecision': Number.prototype.toPrecision,
    'Number#toString': Number.prototype.toString,
    'Number#valueOf': Number.prototype.valueOf,
    'Math.abs': Math.abs,
    'Math.acos': Math.acos,
    'Math.acosh': Math.acosh,
    'Math.asin': Math.asin,
    'Math.asinh': Math.asinh,
    'Math.atan': Math.atan,
    'Math.atanh': Math.atanh,
    'Math.atan2': Math.atan2,
    'Math.cbrt': Math.cbrt,
    'Math.ceil': Math.ceil,
    'Math.clz32': Math.clz32,
    'Math.cos': Math.cos,
    'Math.cosh': Math.cosh,
    'Math.exp': Math.exp,
    'Math.expm1': Math.expm1,
    'Math.floor': Math.floor,
    'Math.fround': Math.fround,
    'Math.hypot': Math.hypot,
    'Math.imul': Math.imul,
    'Math.log': Math.log,
    'Math.log1p': Math.log1p,
    'Math.log10': Math.log10,
    'Math.log2': Math.log2,
    'Math.max': Math.max,
    'Math.min': Math.min,
    'Math.pow': Math.pow,
    'Math.random': Math.random,
    'Math.round': Math.round,
    'Math.sign': Math.sign,
    'Math.sin': Math.sin,
    'Math.sinh': Math.sinh,
    'Math.sqrt': Math.sqrt,
    'Math.tan': Math.tan,
    'Math.tanh': Math.tanh,
    'Math.trunc': Math.trunc,
    'Date.now': Date.now,
    'Date.parse': Date.parse,
    'Date.prototype': Date.prototype,
    'Date.UTC': Date.UTC,
    'Date#getDate': Date.prototype.getDate,
    'Date#getDay': Date.prototype.getDay,
    'Date#getFullYear': Date.prototype.getFullYear,
    'Date#getHours': Date.prototype.getHours,
    'Date#getMilliseconds': Date.prototype.getMilliseconds,
    'Date#getMinutes': Date.prototype.getMinutes,
    'Date#getMonth': Date.prototype.getMonth,
    'Date#getSeconds': Date.prototype.getSeconds,
    'Date#getTime': Date.prototype.getTime,
    'Date#getTimezoneOffset': Date.prototype.getTimezoneOffset,
    'Date#getUTCDate': Date.prototype.getUTCDate,
    'Date#getUTCDay': Date.prototype.getUTCDay,
    'Date#getUTCFullYear': Date.prototype.getUTCFullYear,
    'Date#getUTCHours': Date.prototype.getUTCHours,
    'Date#getUTCMilliseconds': Date.prototype.getUTCMilliseconds,
    'Date#getUTCMinutes': Date.prototype.getUTCMinutes,
    'Date#getUTCMonth': Date.prototype.getUTCMonth,
    'Date#getUTCSeconds': Date.prototype.getUTCSeconds,
    'Date#setDate': Date.prototype.setDate,
    'Date#setFullYear': Date.prototype.setFullYear,
    'Date#setHours': Date.prototype.setHours,
    'Date#setMilliseconds': Date.prototype.setMilliseconds,
    'Date#setMinutes': Date.prototype.setMinutes,
    'Date#setMonth': Date.prototype.setMonth,
    'Date#setSeconds': Date.prototype.setSeconds,
    'Date#setTime': Date.prototype.setTime,
    'Date#setUTCDate': Date.prototype.setUTCDate,
    'Date#setUTCFullYear': Date.prototype.setUTCFullYear,
    'Date#setUTCHours': Date.prototype.setUTCHours,
    'Date#setUTCMilliseconds': Date.prototype.setUTCMilliseconds,
    'Date#setUTCMinutes': Date.prototype.setUTCMinutes,
    'Date#setUTCMonth': Date.prototype.setUTCMonth,
    'Date#setUTCSeconds': Date.prototype.setUTCSeconds,
    'Date#toDateString': Date.prototype.toDateString,
    'Date#toISOString': Date.prototype.toISOString,
    'Date#toJSON': Date.prototype.toJSON,
    'Date#toLocaleDateString': Date.prototype.toLocaleDateString,
    'Date#toLocaleString': Date.prototype.toLocaleString,
    'Date#toLocaleTimeString': Date.prototype.toLocaleTimeString,
    'Date#toString': Date.prototype.toString,
    'Date#toTimeString': Date.prototype.toTimeString,
    'Date#toUTCString': Date.prototype.toUTCString,
    'Date#valueOf': Date.prototype.valueOf,
    'Date#@@toPrimitive': Date.prototype[Symbol.toPrimitive],
    'Date#getYear': Date.prototype.getYear,  // Annex B
    'Date#setYear': Date.prototype.setYear,  // Annex B
    'String.fromCharCode': String.fromCharCode,
    'String.fromCodePoint': String.fromCodePoint,
    'String.prototype': String.prototype,
    'String.raw': String.raw,
    'String#charAt': String.prototype.charAt,
    'String#charCodeAt': String.prototype.charCodeAt,
    'String#codePointAt': String.prototype.codePointAt,
    'String#concat': String.prototype.concat,
    'String#endsWith': String.prototype.endsWith,
    'String#includes': String.prototype.includes,
    'String#indexOf': String.prototype.indexOf,
    'String#lastIndexOf': String.prototype.lastIndexOf,
    'String#localeCompare': String.prototype.localeCompare,
    'String#match': String.prototype.match,
    'String#normalize': String.prototype.normalize,
    'String#padEnd': String.prototype.padEnd,  // ES2017
    'String#padStart': String.prototype.padStart,  // ES2017
    'String#repeat': String.prototype.repeat,
    'String#replace': String.prototype.replace,
    'String#search': String.prototype.search,
    'String#slice': String.prototype.slice,
    'String#split': String.prototype.split,
    'String#startsWith': String.prototype.startsWith,
    'String#substring': String.prototype.substring,
    'String#toLocaleLowerCase': String.prototype.toLocaleLowerCase,
    'String#toLocaleUpperCase': String.prototype.toLocaleUpperCase,
    'String#toLowerCase': String.prototype.toLowerCase,
    'String#toString': String.prototype.toString,
    'String#toUpperCase': String.prototype.toUpperCase,
    'String#trim': String.prototype.trim,
    'String#valueOf': String.prototype.valueOf,
    'String#@@iterator': String.prototype[Symbol.iterator],
    'String#substr': String.prototype.substr,  // Annex B
    'String#anchor': String.prototype.anchor,  // Annex B
    'String#big': String.prototype.big,  // Annex B
    'String#blink': String.prototype.blink,  // Annex B
    'String#bold': String.prototype.bold,  // Annex B
    'String#fixed': String.prototype.fixed,  // Annex B
    'String#fontcolor': String.prototype.fontcolor,  // Annex B
    'String#fontsize': String.prototype.fontsize,  // Annex B
    'String#italics': String.prototype.italics,  // Annex B
    'String#link': String.prototype.link,  // Annex B
    'String#small': String.prototype.small,  // Annex B
    'String#strike': String.prototype.strike,  // Annex B
    'String#sub': String.prototype.sub,  // Annex B
    'String#sup': String.prototype.sup,  // Annex B
    'String#trimLeft': String.prototype.trimLeft,  // Proprietary
    'String#trimRight': String.prototype.trimRight,  // Propietary
    '<StringIterator>.prototype': stringIteratorPrototype,
    '<StringIterator>#next': stringIteratorPrototype.next,
    'RegExp.prototype': RegExp.prototype,
    'RegExp.get @@species': Object.getOwnPropertyDescriptor(RegExp, Symbol.species).get,
    'RegExp#exec': RegExp.prototype.exec,
    'RegExp#get flags': Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags').get,
    'RegExp#get global': Object.getOwnPropertyDescriptor(RegExp.prototype, 'global').get,
    'RegExp#get ignoreCase': Object.getOwnPropertyDescriptor(RegExp.prototype, 'ignoreCase').get,
    'RegExp#@@match': RegExp.prototype[Symbol.match],
    'RegExp#get multiline': Object.getOwnPropertyDescriptor(RegExp.prototype, 'multiline').get,
    'RegExp#@@replace': RegExp.prototype[Symbol.replace],
    'RegExp#@@search': RegExp.prototype[Symbol.search],
    'RegExp#get source': Object.getOwnPropertyDescriptor(RegExp.prototype, 'source').get,
    'RegExp#@@split': RegExp.prototype[Symbol.split],
    'RegExp#get sticky': Object.getOwnPropertyDescriptor(RegExp.prototype, 'sticky').get,
    'RegExp#test': RegExp.prototype.test,
    'RegExp#toString': RegExp.prototype.toString,
    'RegExp#get unicode': Object.getOwnPropertyDescriptor(RegExp.prototype, 'unicode').get,
    'RegExp#compile': RegExp.prototype.compile,  // Annex B
    'Array.from': Array.from,
    'Array.isArray': Array.isArray,
    'Array.of': Array.of,
    'Array.prototype': Array.prototype,
    'Array.get @@species': Object.getOwnPropertyDescriptor(Array, Symbol.species).get,
    'Array#concat': Array.prototype.concat,
    'Array#copyWithin': Array.prototype.copyWithin,
    'Array#entries': Array.prototype.entries,
    'Array#every': Array.prototype.every,
    'Array#fill': Array.prototype.fill,
    'Array#filter': Array.prototype.filter,
    'Array#find': Array.prototype.find,
    'Array#findIndex': Array.prototype.findIndex,
    'Array#forEach': Array.prototype.forEach,
    'Array#includes': Array.prototype.includes,  // ES2016
    'Array#indexOf': Array.prototype.indexOf,
    'Array#join': Array.prototype.join,
    'Array#keys': Array.prototype.keys,
    'Array#lastIndexOf': Array.prototype.lastIndexOf,
    'Array#map': Array.prototype.map,
    'Array#pop': Array.prototype.pop,
    'Array#push': Array.prototype.push,
    'Array#reduce': Array.prototype.reduce,
    'Array#reduceRight': Array.prototype.reduceRight,
    'Array#reverse': Array.prototype.reverse,
    'Array#shift': Array.prototype.shift,
    'Array#slice': Array.prototype.slice,
    'Array#some': Array.prototype.some,
    'Array#sort': Array.prototype.sort,
    'Array#splice': Array.prototype.splice,
    'Array#toLocaleString': Array.prototype.toLocaleString,
    'Array#toString': Array.prototype.toString,
    'Array#unshift': Array.prototype.unshift,
    // Work around missing Array.prototype.values in Chrome, Firefox.
    'Array#values': Array.prototype[Symbol.iterator],
    // 'Array#values': Array.prototype.values,
    'Array#@@unscopables': Array.prototype[Symbol.unscopables],
    '<ArrayIterator>.prototype': arrayIteratorPrototype,
    '<ArrayIterator>#next': arrayIteratorPrototype.next,
    '<TypedArray>': typedArray,
    '<TypedArray>.from': typedArray.from,
    '<TypedArray>.of': typedArray.of,
    '<TypedArray>.prototype': typedArray.prototype,
    '<TypedArray>.get @@species': Object.getOwnPropertyDescriptor(typedArray, Symbol.species).get,
    '<TypedArray>#get buffer': Object.getOwnPropertyDescriptor(typedArray.prototype, 'buffer').get,
    '<TypedArray>#get byteLength': Object.getOwnPropertyDescriptor(typedArray.prototype, 'byteLength').get,
    '<TypedArray>#get byteOffset': Object.getOwnPropertyDescriptor(typedArray.prototype, 'byteOffset').get,
    '<TypedArray>#copyWithin': typedArray.prototype.copyWithin,
    '<TypedArray>#entries': typedArray.prototype.entries,
    '<TypedArray>#every': typedArray.prototype.every,
    '<TypedArray>#fill': typedArray.prototype.fill,
    '<TypedArray>#filter': typedArray.prototype.filter,
    '<TypedArray>#find': typedArray.prototype.find,
    '<TypedArray>#findIndex': typedArray.prototype.findIndex,
    '<TypedArray>#forEach': typedArray.prototype.forEach,
    '<TypedArray>#includes': typedArray.prototype.includes,  // ES2016
    '<TypedArray>#indexOf': typedArray.prototype.indexOf,
    '<TypedArray>#join': typedArray.prototype.join,
    '<TypedArray>#keys': typedArray.prototype.keys,
    '<TypedArray>#lastIndexOf': typedArray.prototype.lastIndexOf,
    '<TypedArray>#get length': Object.getOwnPropertyDescriptor(typedArray.prototype, 'length').get,
    '<TypedArray>#map': typedArray.prototype.map,
    '<TypedArray>#reduce': typedArray.prototype.reduce,
    '<TypedArray>#reduceRight': typedArray.prototype.reduceRight,
    '<TypedArray>#reverse': typedArray.prototype.reverse,
    '<TypedArray>#set': typedArray.prototype.set,
    '<TypedArray>#slice': typedArray.prototype.slice,
    '<TypedArray>#some': typedArray.prototype.some,
    '<TypedArray>#sort': typedArray.prototype.sort,
    '<TypedArray>#subarray': typedArray.prototype.subarray,
    '<TypedArray>#toLocaleString': typedArray.prototype.toLocaleString,
    '<TypedArray>#toString': typedArray.prototype.toString,
    '<TypedArray>#values': typedArray.prototype.values,
    '<TypedArray>#get @@toStringTag': Object.getOwnPropertyDescriptor(typedArray.prototype, Symbol.toStringTag).get,
    'Uint8Array.prototype': Uint8Array.prototype,
    'Uint8ClampedArray.prototype': Uint8ClampedArray.prototype,
    'Uint16Array.prototype': Uint16Array.prototype,
    'Uint32Array.prototype': Uint32Array.prototype,
    'Int8Array.prototype': Int8Array.prototype,
    'Int16Array.prototype': Int16Array.prototype,
    'Int32Array.prototype': Int32Array.prototype,
    'Float32Array.prototype': Float32Array.prototype,
    'Float64Array.prototype': Float64Array.prototype,
    'Map.prototype': Map.prototype,
    'Map.get @@species': Object.getOwnPropertyDescriptor(Map, Symbol.species).get,
    'Map#clear': Map.prototype.clear,
    'Map#delete': Map.prototype.delete,
    'Map#entries': Map.prototype.entries,
    'Map#forEach': Map.prototype.forEach,
    'Map#get': Map.prototype.get,
    'Map#has': Map.prototype.has,
    'Map#keys': Map.prototype.keys,
    'Map#set': Map.prototype.set,
    'Map#get size': Object.getOwnPropertyDescriptor(Map.prototype, 'size').get,
    'Map#values': Map.prototype.values,
    '<MapIterator>.prototype': mapIteratorPrototype,
    '<MapIterator>#next': mapIteratorPrototype.next,
    'Set.prototype': Set.prototype,
    'Set.get @@species': Object.getOwnPropertyDescriptor(Set, Symbol.species).get,
    'Set#add': Set.prototype.add,
    'Set#clear': Set.prototype.clear,
    'Set#delete': Set.prototype.delete,
    'Set#entries': Set.prototype.entries,
    'Set#forEach': Set.prototype.forEach,
    'Set#has': Set.prototype.has,
    'Set#keys': Set.prototype.keys,
    'Set#get size': Object.getOwnPropertyDescriptor(Set.prototype, 'size').get,
    'Set#values': Set.prototype.values,
    '<SetIterator>.prototype': setIteratorPrototype,
    '<SetIterator>#next': setIteratorPrototype.next,
    'WeakMap.prototype': WeakMap.prototype,
    'WeakMap#delete': WeakMap.prototype.delete,
    'WeakMap#get': WeakMap.prototype.get,
    'WeakMap#has': WeakMap.prototype.has,
    'WeakMap#set': WeakMap.prototype.set,
    'WeakSet.prototype': WeakSet.prototype,
    'WeakSet#add': WeakSet.prototype.add,
    'WeakSet#delete': WeakSet.prototype.delete,
    'WeakSet#has': WeakSet.prototype.has,
    'ArrayBuffer.isView': ArrayBuffer.isView,
    'ArrayBuffer.prototype': ArrayBuffer.isPrototype,
    'ArrayBuffer.get @@species': Object.getOwnPropertyDescriptor(ArrayBuffer, Symbol.species).get,
    'ArrayBuffer#get byteLength': Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get,
    'ArrayBuffer#slice': ArrayBuffer.prototype.slice,
    'DataView.prototype': DataView.prototype,
    'DataView#get buffer': Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer').get,
    'DataView#get byteLength': Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get,
    'DataView#get byteOffset': Object.getOwnPropertyDescriptor(DataView.prototype, 'byteOffset').get,
    'DataView#getFloat32': DataView.prototype.getFloat32,
    'DataView#getFloat64': DataView.prototype.getFloat64,
    'DataView#getInt8': DataView.prototype.getInt8,
    'DataView#getInt16': DataView.prototype.getInt16,
    'DataView#getInt32': DataView.prototype.getInt32,
    'DataView#getUint8': DataView.prototype.getUint8,
    'DataView#getUint16': DataView.prototype.getUint16,
    'DataView#getUint32': DataView.prototype.getUint32,
    'DataView#setFloat32': DataView.prototype.setFloat32,
    'DataView#setFloat64': DataView.prototype.setFloat64,
    'DataView#setInt8': DataView.prototype.setInt8,
    'DataView#setInt16': DataView.prototype.setInt16,
    'DataView#setInt32': DataView.prototype.setInt32,
    'DataView#setUint8': DataView.prototype.setUint8,
    'DataView#setUint16': DataView.prototype.setUint16,
    'DataView#setUint32': DataView.prototype.setUint32,
    'JSON.parse': JSON.parse,
    'JSON.stringify': JSON.stringify,
    '<Iterator>.prototype': iteratorPrototype,
    '<Iterator>#@@iterator': iteratorPrototype[Symbol.iterator],
    '<GeneratorFunction>': generatorFunction,
    '<Generator>': generator,
    '<Generator>.prototype': generator.prototype,
    '<Generator>#next': generator.prototype.next,
    '<Generator>#throw': generator.prototype.throw,
    'Promise.all': Promise.all,
    'Promise.prototype': Promise.prototype,
    'Promise.race': Promise.race,
    'Promise.reject': Promise.reject,
    'Promise.resolve': Promise.resolve,
    'Promise.get @@species': Object.getOwnPropertyDescriptor(Promise, Symbol.species).get,
    'Promise#catch': Promise.prototype.catch,
    'Promise#then': Promise.prototype.then,
    'Reflect.apply': Reflect.apply,
    'Reflect.construct': Reflect.construct,
    'Reflect.defineProperty': Reflect.defineProperty,
    'Reflect.deleteProperty': Reflect.deleteProperty,
    'Reflect.enumerate': Reflect.enumerate,
    'Reflect.get': Reflect.get,
    'Reflect.getOwnPropertyDescriptor': Reflect.getOwnPropertyDescriptor,
    'Reflect.getPrototypeOf': Reflect.getPrototypeOf,
    'Reflect.has': Reflect.has,
    'Reflect.isExtensible': Reflect.isExtensible,
    'Reflect.ownKeys': Reflect.ownKeys,
    'Reflect.preventExtensions': Reflect.preventExtensions,
    'Reflect.set': Reflect.set,
    'Reflect.setPrototypeOf': Reflect.setPrototypeOf,
    'Proxy.revocable': Proxy.revocable,
    '<ThrowTypeError>': Object.getOwnPropertyDescriptor(strictArguments, 'caller').get,
    'Function#get caller': Object.getOwnPropertyDescriptor(Function.prototype, 'caller').get,  // Proprietary
    'Function#set caller': Object.getOwnPropertyDescriptor(Function.prototype, 'caller').set,  // Proprietary
    'Function#get arguments': Object.getOwnPropertyDescriptor(Function.prototype, 'arguments').get,  // Proprietary
    'Function#set arguments': Object.getOwnPropertyDescriptor(Function.prototype, 'arguments').set,  // Proprietary
    // Module namespace object @@iterator
  };
  for (const [name, value] of Object.entries(standardObjects)) {
    if (object === value)
      return name;
  }
  // function, Function, arrow function, method, Function#bind results
  // generator function, generator method
  // generator instance
  // ".prototype"s of ^
  // new Boolean, new Integer, new String, new Symbol
  // new Error, new Date
  // Arguments
  // Object#__proto__ (getter, setter)
  // generatorFn.__proto__, .constructor?
  // %IteratorPrototype%
  // string iterators, array iterators, map iterators, set iterators
  // array exotic object
  // typed arrays
  // Map, Set, WeakMap, WeakSet
  // ArrayBuffer, DataView
  // Promise
  // module namespace exotic objects
  let constructorName;
  const {constructor} = object;
  if (typeOf(constructor) === 'object') {
    const {name} = constructor;
    if (typeOf(name) === 'string')
      constructorName = name;
  }
  return 'object '
      + (constructorName !== undefined ? dumpString(constructorName) + ' ' : '')
      + dumpString(Object.prototype.toString.call(object).slice(8, -1));
}

function typeOf(value) {
  switch (typeof value) {
    case 'undefined': return value === undefined ? 'undefined' : 'object';
    case 'boolean':   return 'boolean';
    case 'number':    return 'number';
    case 'string':    return 'string';
    case 'symbol':    return 'symbol';
    case 'object':    return value === null ? 'null' : 'object';
    default:          return 'object';
  }
}
