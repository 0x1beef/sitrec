import {getPixels} from '../get-pixels-mick.js'
import {Mesh, MeshNormalMaterial, PlaneGeometry, Vector3,} from "../../../three.js/build/three.module";
import QuadTextureMaterial from './material/QuadTextureMaterial'
import {drop} from '../../SphericalMath'
import {SITREC_SERVER} from "../../../config";
import {assert} from "../../utils";
import {LLAToEUS, wgs84} from "../../LLA-ECEF-ENU";
import {DebugSphere} from "../../threeExt";
// MICK: map33 uses Z up, so coordinates are modified in a couple of places from the original source
//


//////////////////////////////////////////////////////////////////////////////
// MICK utils

// convert a tile x position to longitude
// x is the horizontal tile position
// it can be floating point which indicates a position inside the tile
// if no fraction, then it's the left edge of the tile. If 0.5, then the middle.
// 1.0 the right edge, coincident with the next tile
function getLeftLongitude(x, z) {
  // Calculate the number of horizontal tiles at zoom level z
  let numTiles = Math.pow(2, z);

  // Calculate the left longitude (west edge)
  let leftLongitude = (x / numTiles) * 360 - 180;
  return leftLongitude;
}

// convert a tile y position to latitude
function getNorthLatitude(y, z) {
  // Calculate the number of vertical tiles at zoom level z
  let numTiles = Math.pow(2, z);

  // Calculate the latitude of the northern edge of the tile
  let latNorthRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / numTiles)));
  let latNorth = latNorthRad * 180 / Math.PI;
  return latNorth;
}



const tileMaterial = new MeshNormalMaterial({wireframe: true})

class Utils {
  static long2tile (lon, zoom) {
    return (lon + 180) / 360 * Math.pow(2, zoom)
  }

  static lat2tile (lat, zoom) {
    return (
      (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
      )
  }

  static geo2tile (geoLocation, zoom) {
    const maxTile = Math.pow(2, zoom);
    return {
      x: Math.abs(Math.floor(Utils.long2tile(geoLocation[1], zoom)) % maxTile),
      y: Math.abs(Math.floor(Utils.lat2tile(geoLocation[0], zoom)) % maxTile)
    }
  }

  // Calculate the world position of a tile.
  static tile2position(z, x, y, center, tileSize) {


/*
// original code incorporate the zoom level, unnecessary and implemented wrong so position was off is zoom < 10
    const offsetAtZ = (z) => {
      return {
        x: center.x / Math.pow(2, 10 - z),
        y: center.y / Math.pow(2, 10 - z),
      };
    };
    const offset = offsetAtZ(z);
    const result = {
      x: (x - center.x - (offset.x % 1) + (center.x % 1)) * tileSize,
      y: (-y + center.y + (offset.y % 1) - (center.y % 1)) * tileSize,
      z: 0
    }

 */

    const result = {
      x: (x - center.x) * tileSize,
      y: (-y + center.y) * tileSize,
      z: 0
    }


    //    console.log("zoom:"+z+" x:"+x+" y:"+y+"  center.xy=("+center.x+","+center.y+")")
    /*
        console.log("tileSize = "+tileSize)
        console.log("(offset.x) = " + (offset.x));
        console.log("(offset.y) = " + (offset.y));
        console.log("(offset.x % 1) = " + (offset.x % 1));
        console.log("(offset.y % 1) = " + (offset.y % 1));
        console.log("(center.x % 1) = " + (center.x % 1));
        console.log("(center.y % 1) = " + (center.y % 1));
    */
//    console.log("Result=("+result.x+","+result.y+")")
    return result
  }

  static position2tile(z, x, y, center, tileSize) {
    const centerPosition = Utils.tile2position(z, center.x, center.y, center, tileSize)
    console.log(centerPosition)
    const deltaX = Math.round((x - centerPosition.x) / tileSize)
    const deltaY = Math.round(-(y - centerPosition.y) / tileSize)
    return {x: deltaX + center.x, y: deltaY + center.y, z}
  }
}

class MapPicker {
  constructor(camera, map, domElement, controls) {
    this.vec = new Vector3(); // create once and reuse
    this.position = new Vector3(); // create once and reuse
    this.camera = camera
    this.map = map
    this.domElement = domElement
    this.controls = controls

    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.domElement.addEventListener('dblclick', this.onMouseClick.bind(this))
  }

  computeWorldPosition(event) {
    // cf. https://stackoverflow.com/a/13091694/343834
    this.vec.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
      0.5);

    this.vec.unproject(this.camera);

    this.vec.sub(this.camera.position).normalize();

    var distance = -this.camera.position.z / this.vec.z;

    this.position.copy(this.camera.position).add(this.vec.multiplyScalar(distance));
  }

  onMouseMove(event) {
    // this.computeWorldPosition(event)
  }

  onMouseClick(event) {
    this.computeWorldPosition(event)
    this.map.addFromPosition(this.position.x, this.position.y)
  }

  go(lat, lon) {
    this.map.clean()
    this.map.geoLocation = [lat, lon]
    this.map.init()
  }
}

class Source {
  constructor(api, token, options) {
    this.supportedApis = {
      'osm': this.mapUrlOSM.bind(this),
      'mapbox': this.mapUrlMapbox.bind(this),
      'eox': this.mapUrlSentinel2Cloudless.bind(this),
      'maptiler': this.mapUrlmapTiler.bind(this),
      'wireframe': this.mapUrlmapWireframe.bind(this),
    }
    if (!(api in this.supportedApis)) {
      throw new Error('Unknown source api');
    }
    this.api = api
    this.token = token
    this.options = options
  }

  mapUrlOSM(z, x, y) {
//    return `https://c.tile.openstreetmap.org/${z}/${x}/${y}.png`
    return SITREC_SERVER+"cachemaps.php?url=" + encodeURIComponent(`https://c.tile.openstreetmap.org/${z}/${x}/${y}.png`)
  }

  mapUrlMapbox(z, x, y) {
//    return `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg80?access_token=${this.token}`
    return SITREC_SERVER+"cachemaps.php?url=" + encodeURIComponent(`https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg80`)
  }

  mapUrlSentinel2Cloudless(z, x, y) {
    // cf. https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml
//    return `https://tiles.maps.eox.at/wmts?layer=s2cloudless_3857&style=default&tilematrixset=g&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix=${z}&TileCol=${x}&TileRow=${y}`
    return SITREC_SERVER+"cachemaps.php?url=" + encodeURIComponent(`https://tiles.maps.eox.at/wmts?layer=s2cloudless_3857&style=default&tilematrixset=g&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix=${z}&TileCol=${x}&TileRow=${y}`)
  }

  mapUrlmapTiler(z, x, y) {
    return `https://api.maptiler.com/tiles/satellite/${z}/${x}/${y}.jpg?key=${this.token}`
  }

  mapUrlmapWireframe(z, x, y) {
    return null;
  }

  mapUrl(z, x, y) {
    return this.supportedApis[this.api](z, x, y)
  }

}

class Tile {
  constructor(map, z, x, y, size) {
    this.map = map
    this.z = z
    this.x = x
    this.y = y
    this.size = size || this.map.options.tileSize
    this.baseURL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
    this.shape = null
    this.elevation = null
    this.seamX = false
    this.seamY = false
  }

  key() {
    return `${this.z}/${this.x}/${this.y}`
  }
  keyNeighX() {
    return `${this.z}/${this.x + 1}/${this.y}`
  }
  keyNeighY() {
    return `${this.z}/${this.x}/${this.y + 1}`
  }

  url() {
    return `${this.baseURL}/${this.z}/${this.x}/${this.y}.png`
  }

  mapUrl() {
    return this.map.source.mapUrl(this.z, this.x, this.y)
  }

  computeElevation(pixels) {
    this.shape = pixels.shape
    const elevation = new Float32Array(pixels.shape[0] * pixels.shape[1])
    for (let i = 0; i < pixels.shape[0]; i++) {
      for (let j = 0; j < pixels.shape[1]; j++) {
        const ij = i + pixels.shape[0] * j
        const rgba = ij * 4
        elevation[ij] =
          pixels.data[rgba] * 256.0 +
          pixels.data[rgba + 1] +
          pixels.data[rgba + 2] / 256.0 -
          32768.0
      }
    }
    this.elevation = elevation
  }

  buildGeometry() {
    const geometry = new PlaneGeometry(
      this.size,
      this.size,
      this.map.options.tileSegments,
      this.map.options.tileSegments
    )

    geometry.rotateX(-Math.PI * 0.5);  // MICK
    this.geometry = geometry
  }


  // recalculate the X,Y, Z values for all the verticles of a tile
  // at this point we are Z-up
  recalculateCurve(radius) {

    if (radius !== wgs84.RADIUS) {
      console.warn('recalculateCurve() - radius is not the default WGS84 radius, so the curve will be incorrect')
      console.warn('Flat earth simulation will need a different calculation')
    }


    var geometry = this.geometry;
    if (this.mesh !== undefined){
      geometry = this.mesh.geometry;
      //    console.log("Recalculating Mesh Geometry"+geometry)
    } else {
      //    console.log("Recalculating First Geometry"+geometry)
    }

    assert(geometry !== undefined, 'Geometry not defined in map33.js')

    // we will be calculating the tile vertext positions in EUS
    // but they will be relative to the tileCenter
    //
    const tileCenter = this.mesh.position;

    // for a 100x100 mesh, that's 100 squares on a side
    // but an extra row and column of vertices
    // so 101x101 points = 10201 points
    //
    // the elevation map is 256x256 points = 65536 points

    const nPosition = Math.sqrt(geometry.attributes.position.count) // size of side of mesh in points

    const nElevation = Math.sqrt(this.elevation.length) // size of side of elevation map (probably 256)

    // we need to calculate the ratio of the elevation map to the mesh
    // 0 maps to 0, 100 maps to 255, so we are multiplying by 2.55 (255/100), or (256-1)/100
    const ratio = (nElevation - 1) / (nPosition)

    const xTile = this.x;
    const yTile = this.y;
    const zoomTile = this.z;

    for (let i = 0; i < geometry.attributes.position.count;i++) {

      const xIndex = i % nPosition
      const yIndex = Math.floor(i / nPosition)

      // calculate the fraction of the tile that the vertext is in
      const yTileFraction = yIndex / (nPosition - 1)
      const xTileFraction = xIndex / (nPosition - 1)

      // get that in world tile coordinates
      const xWorld = xTile + xTileFraction;
      const yWorld = yTile + yTileFraction;

      // convert that to lat/lon
      const lat = getNorthLatitude(yWorld, zoomTile);
      const lon = getLeftLongitude(xWorld, zoomTile);

      // get elevation
      const elevationIndex = Math.round(Math.round(yIndex * ratio) * nElevation + xIndex * ratio)

      const elevation = this.elevation[elevationIndex] * this.map.options.zScale;

      // convert that to EUS
      const vertexESU = LLAToEUS(lat,lon,elevation)

      // subtract the center of the tile
      const vertex = vertexESU.sub(tileCenter)

      assert(!isNaN(vertex.x), 'vertex.x is NaN in map33.js i='+i)
      assert(!isNaN(vertex.y), 'vertex.y is NaN in map33.js')
      assert(!isNaN(vertex.z), 'vertex.z is NaN in map33.js')

      // set the vertex position in tile space
        geometry.attributes.position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    // Removed this as it's expensive. And seems not needed for just curve flattenog.
    // geometry.computeVertexNormals()

    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()


    geometry.attributes.position.needsUpdate = true;
  }


  childrens() {
    return [
      new Tile(this.map, this.z + 1, this.x * 2, this.y * 2),
      new Tile(this.map, this.z + 1, this.x * 2, this.y * 2 + 1),
      new Tile(this.map, this.z + 1, this.x * 2 + 1, this.y * 2),
      new Tile(this.map, this.z + 1, this.x * 2 + 1, this.y * 2 + 1),
    ]
  }

  // QuadTextureMaterial uses four textures
  buildMaterial() {
    const urls = this.childrens().map(tile => tile.mapUrl())
//    console.log(urls)
    return QuadTextureMaterial(urls)
  }

  buildmesh() {
    if (this.mapUrl(0,0,0) != null) {
      this.buildMaterial().then((material) => {
        this.mesh.material = material

      })
    }
    this.mesh = new Mesh(this.geometry, tileMaterial)


  }

  fetch(signal) {
    var url = SITREC_SERVER+"cachemaps.php?url="+encodeURIComponent(this.url())
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      getPixels(url, (err, pixels) => {
        if (err) console.error("fetch() -> "+ err)
        this.computeElevation(pixels)
        this.buildGeometry()
        this.buildmesh()
        resolve(this)
      })
    })
  }


  setPosition(center) {
    const position = Utils.tile2position(
        this.z,
        this.x,
        this.y,
      center,
      this.size
    )
  //  console.log ("Tile position ZXY = "+position.z+","+position.x+","+position.y)
  //  this.mesh.position.set(...Object.values(position))

    const correctPosition = new Vector3(position.x, position.z,-position.y) // MICK

    this.mesh.position.set(correctPosition.x, correctPosition.y,correctPosition.z) // MICK

    // this is in the center of the tile
    // DebugSphere("Tile"+this.x+","+this.y,correctPosition,100)

    // we need to update the matrices, otherwise collision will not work until rendered
    // which can lead to odd asynchronous bugs where the last tiles loaded
    // don't have matrices set, and so act as holes, but this varies with loading order
    this.mesh.updateMatrix()
    this.mesh.updateMatrixWorld() //
  }

  resolveSeamY(neighbor) {
    const tPosition = this.mesh.geometry.attributes.position.count
    const nPosition = Math.sqrt(tPosition)
    const nPositionN = Math.sqrt(
      neighbor.mesh.geometry.attributes.position.count
    )
    if (nPosition !== nPositionN) {
      console.error("resolveSeamY only implemented for geometries of same size")
      return
    }
    for (let i = tPosition - nPosition; i < tPosition; i++) {
      // Mick - here I changed Z to Y, as we've rotated
      this.mesh.geometry.attributes.position.setY(
        i,
        neighbor.mesh.geometry.attributes.position.getY(
          i - (tPosition - nPosition)
        )
      )
    }
  }

  resolveSeamX(neighbor) {
    const tPosition = this.mesh.geometry.attributes.position.count
    const nPosition = Math.sqrt(tPosition)
    const nPositionN = Math.sqrt(
      neighbor.mesh.geometry.attributes.position.count
    )
    if (nPosition !== nPositionN) {
      console.error("resolveSeamX only implemented for geometries of same size")
      return
    }
    for (let i = nPosition - 1; i < tPosition; i += nPosition) {
      this.mesh.geometry.attributes.position.setY(
        i,
        neighbor.mesh.geometry.attributes.position.getY(i - nPosition + 1)
      )
    }
  }

  resolveSeams(cache,doNormals=true) {
    let worked = false
    const neighY = cache[this.keyNeighY()]
    const neighX = cache[this.keyNeighX()]
    if (this.seamY === false && neighY && neighY.mesh) {
      this.resolveSeamY(neighY)
      this.seamY = true
      worked = true
    }
    if (this.seamX === false && neighX && neighX.mesh) {
      this.resolveSeamX(neighX)
      this.seamX = true
      worked = true
    }
    if (worked) {
      this.mesh.geometry.attributes.position.needsUpdate = true
      if (doNormals)
        this.mesh.geometry.computeVertexNormals()
    }
  }
}

class Map {
  constructor (scene,  source, geoLocation, options={}) {
    this.scene = scene
  //  this.camera = camera
    this.source = source
    this.geoLocation = geoLocation


    this.options = this.getOptions(options)
    this.nTiles = this.options.nTiles
    this.zoom = this.options.zoom
    this.tileSize = this.options.tileSize
    this.radius = options.radius ?? wgs84.RADIUS// 6378137  // defaults to WGS84 radius
    this.loadedCallback = options.loadedCallback; // function to call when map is all loaded
    this.loaded = false; // mick flag to indicate loading is finished

    this.tileCache = {};


    this.init()
  }

  defaultOptions = {
    nTiles: 3,
    zoom: 11,
    tileSize: 600,
    tileSegments: 100,
    zScale: 0.045,
  }

  getOptions(providedOptions) {
    const options = Object.assign({}, this.defaultOptions, providedOptions)
    options.tileSegments = Math.min(256, Math.round(options.tileSegments))
    return options
  }

  init() {
    this.center = Utils.geo2tile(this.geoLocation, this.zoom)
    const tileOffset = Math.floor(this.nTiles / 2)
    this.controller = new AbortController();

    for (let i = 0; i < this.nTiles; i++) {
      for (let j = 0; j < this.nTiles; j++) {
        const tile = new Tile(this, this.zoom, this.center.x + i - tileOffset, this.center.y + j - tileOffset)
        this.tileCache[tile.key()] = tile
      }
    }

    const promises = Object.values(this.tileCache).map(tile =>
        tile.fetch(this.controller.signal).then(tile => {
          if (this.controller.signal.aborted) {
            // flag that it's aborted, so we can filter it out later
            return Promise.resolve('Aborted');
          }
          tile.setPosition(this.center)
          this.scene.add(tile.mesh)
          return tile
        })
    )

    Promise.all(promises).then(tiles => {
      // Filter out the 'Aborted' values
      tiles = tiles.filter(tile => tile !== 'Aborted');

      tiles.reverse().forEach(tile => {
        tile.recalculateCurve(this.radius)
        tile.resolveSeams(this.tileCache)
      })
      if (this.loadedCallback) this.loadedCallback();
      this.loaded = true; // mick flag loading is finished
    })

    // To abort the loading of tiles, call controller.abort()
    // controller.abort();
  }

  recalculateCurveMap(radius) {

    if (radius == this.radius) {
      console.log('map33 recalculateCurveMap Radius is the same - no need to recalculate, radius = '+radius);
      return;
    }

    if (!this.loaded) {
      console.warn('Map not loaded yet - only call recalculateCurveMap after loadedCallback')
      return;
    }
    this.radius = radius
    Object.values(this.tileCache).forEach(tile => {
      tile.recalculateCurve(radius)
    })
    // Object.values(this.tileCache).reverse().forEach(tile => {
    //   tile.seamY = false
    //   tile.seamX = false
    //   tile.resolveSeams(this.tileCache, false) // fix seams, but normals are fine
    // })
  }



  addFromPosition(posX, posY) {
    const {
      x,
      y,
      z
    } = Utils.position2tile(this.zoom, posX, posY, this.center, this.tileSize)
    console.log({x, y, z})
    const tile = new Tile(this, this.zoom, x, y)

    if (tile.key() in this.tileCache) return

    this.tileCache[tile.key()] = tile
    tile.fetch().then(tile => {
      tile.setPosition(this.center)
//      tile.recalculateCurve(6371000)
//      tile.mesh.geometry.needsUpdate = true;
      this.scene.add(tile.mesh)
      console.log("Adding "+posX+","+posY)
    }).then(() => {
      Object.values(this.tileCache).forEach(tile => {
        tile.recalculateCurve(this.radius)
        tile.resolveSeams(this.tileCache)
      })
    })
  }

  clean() {
      console.log("map33 clean()");


    // abort the pending loading of tiles
    this.controller.abort();

    Object.values(this.tileCache).forEach(tile => {
      if (tile.mesh !== undefined) {
        this.scene.remove(tile.mesh)
        tile.mesh.geometry.dispose();
      //  console.log("Disposing "+tile.key())

        if (tile.mesh.material.uniforms !== undefined) {
            assert(tile.mesh.material.uniforms !== undefined, 'Uniforms not defined');

          ['mapSW', 'mapNW', 'mapSE', 'mapNE'].forEach(key => {
//            console.log("Disposing "+key)
            tile.mesh.material.uniforms[key].value.dispose();
          });

        }

        tile.mesh.material.dispose()
      }
    })
    this.tileCache = {}
    this.scene = null; // MICK - added to help with memory management
  }
}

export {Map, Source, MapPicker}
