 import {getPixels} from '../get-pixels-mick.js'
import {Mesh, MeshNormalMaterial, PlaneGeometry, Vector3,} from "three";
import QuadTextureMaterial from './material/QuadTextureMaterial'
import {SITREC_ROOT, SITREC_SERVER} from "../../../config";
import {LLAToEUS, wgs84} from "../../LLA-ECEF-ENU";
 import {assert} from "../../assert.js";
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

  static geo2tileFraction (geoLocation, zoom) {
    const maxTile = Math.pow(2, zoom);
    return {
      x: Math.abs(Utils.long2tile(geoLocation[1], zoom) % maxTile),
      y: Math.abs(Utils.lat2tile(geoLocation[0], zoom) % maxTile)
    }
  }

  // Calculate the world position of a tile.
  static tile2position(z, x, y, center, tileSize) {
    const result = {
      x: (x - center.x) * tileSize,
      y: (-y + center.y) * tileSize,
      z: 0
    }
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


class Source {
  constructor(api, token, options) {
    this.supportedApis = {
      'osm': this.mapUrlOSM.bind(this),
      'mapbox': this.mapUrlMapbox.bind(this),
      'eox': this.mapUrlSentinel2Cloudless.bind(this),
   //   'maptiler': this.mapMaptiler.bind(this),
      'wireframe': this.mapUrlmapWireframe.bind(this),
      'RGBTest': this.mapUrlmapRGBTest.bind(this),
      'NRL' : this.mapNRLTileScheme.bind(this),
      'TEST' : this.mapTEST.bind(this),
    }
    if (!(api in this.supportedApis)) {
      throw new Error('Unknown source api');
    }
    this.api = api
    this.token = token
    this.options = options
  }

  mapUrl(z, x, y) {
    return this.supportedApis[this.api](z, x, y)
  }


  mapMaptiler(z, x, y) {
    return `https://api.maptiler.com/tiles/satellite-v2/${z}/${x}/${y}.jpg?key=NEEDSAKEY`
  }


  // given a urlBase like: https://geoint.nrlssc.org/nrltileserver/wms/category/Imagery?
  // and name,
  wmsGetMapURLFromTile(urlBase, name, z, x, y) {

    // convert z,x,y to lat/lon
    const lat0 = getNorthLatitude(y, z);
    const lon0 = getLeftLongitude(x, z);
    const lat1 = getNorthLatitude(y+1, z);
    const lon1 = getLeftLongitude(x+1, z);

    const url =
        "https://geoint.nrlssc.org/nrltileserver/wms/category/Imagery?"+
        "SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1"+
        "&LAYERS="+name+
        "&FORMAT=image/jpeg"+
        "&CRS=EPSG:4326"+
        `&BBOX=${lon0},${lat1},${lon1},${lat0}`+
        "&WIDTH=256&HEIGHT=256"+
        "&STYLES=";

    console.log("URL = "+url);
    return url;

  }


  // https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/13/3187/1500
  mapTEST(z, x, y) {
    return this.wmsGetMapURLFromTile("https://geoint.nrlssc.org/nrltileserver/wms/category/Imagery?","ImageryMosaic",z,x,y);
  }

  // https://geoint.nrlssc.org/nrltileserver/wmts/1.0.0/ASTER_DEM_SLOPE_VALUE/default/NRLTileScheme/5/2/2.jpg
  mapNRLTileScheme(z, x, y) {
    return SITREC_SERVER+"cachemaps.php?url=" + encodeURIComponent(`https://geoint.nrlssc.org/nrltileserver/wmts/1.0.0/ASTER_DEM_SLOPE_VALUE/default/NRLTileScheme/${z}/${y}/${x}.jpg`)
  }


  // returns a single image for testing color consistency
  mapUrlmapRGBTest(z, x, y) {
    return SITREC_ROOT+"data/images/colour_bars_srgb-255-128-64.png?v=1";
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

  mapUrlmapWireframe(z, x, y) {
    return null;
  }



}

class Tile {
  constructor(map, z, x, y, size) {
    // check values are within range
    assert(z >= 0 && z <= 16, 'z is out of range, z='+z)
 //   assert(x >= 0 && x < Math.pow(2, z), 'x is out of range, x='+x)
    assert(y >= 0 && y < Math.pow(2, z), 'y is out of range, y='+y)


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


  // The "key" is portion of the URL that identifies the tile
  // in the form of "z/x/y"
  // where z is the zoom level, and x and y are the horizontal
  // (E->W) and vertical (N->S) tile positions
  // it's used here as a key to the tileCache
  key() {
    return `${this.z}/${this.x}/${this.y}`
  }
  // Neighbouring tiles are used to resolve seams between tiles
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

  // takes a 2D array of pixel RBGA and computes the elevation
  // note the A value is not used, as the source data is a PNG with no alpha.
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

    this.geometry = geometry
  }


  // recalculate the X,Y, Z values for all the verticles of a tile
  // at this point we are Z-up
  recalculateCurve(radius) {

    // if (radius !== wgs84.RADIUS) {
    //   console.error('recalculateCurve() - radius is not the default WGS84 radius, so the curve will be incorrect')
    //   console.error('Flat earth simulation will need a different calculation')
    // }


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

    const elevationMap = this.elevation ?? new Float32Array(16) // elevation map
    
    const nElevation = Math.sqrt(elevationMap.length) // size of side of elevation map (probably 256)

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

      let elevation = elevationMap[elevationIndex] * this.map.options.zScale;

      // clamp to sea level to avoid z-fighting with ocean tiles
      if (elevation < 0 ) elevation = 0;

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


  // returns the four children tiles of this tile
  // this is used to build the QuadTextureMaterial
  // and all we do is get the four URLs of the children's textures
  // and then combine them in
  childrens() {
    return [
      new Tile(this.map, this.z + 1, this.x * 2, this.y * 2),
      new Tile(this.map, this.z + 1, this.x * 2, this.y * 2 + 1),
      new Tile(this.map, this.z + 1, this.x * 2 + 1, this.y * 2),
      new Tile(this.map, this.z + 1, this.x * 2 + 1, this.y * 2 + 1),
    ]
  }

  // QuadTextureMaterial uses four textures from the children tiles
  // (which are not actually loaded, but we have the URLs)
  // there's a custom shader to combine them together
  //
  buildMaterial() {
    const urls = this.childrens().map(tile => tile.mapUrl())
    return QuadTextureMaterial(urls)





//     // instead of that, just make one texture from this tile
//     const url = this.mapUrl()
//     return new Promise((resolve, reject) => {
//       const texture = new TextureLoader().load(url, resolve, undefined, reject)
//       texture.colorSpace = SRGBColorSpace;
// //      const material = new MeshBasicMaterial({map: texture})
//       const material = new MeshBasicMaterial({map: texture, fog: false})
//
//
//       resolve(material)
//     })


  }

  applyMaterial() {
    if (this.mapUrl(0,0,0) != null) {
      this.buildMaterial().then((material) => {
        this.mesh.material = material
      })
    }
  }

  buildmesh() {
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
        // this.buildGeometry()
        // this.buildmesh()
        this.applyMaterial()
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
//    console.log ("Tile position ZXY = "+position.z+","+position.x+","+position.y)
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

    // the positions are relative to the tile centers
    // so we need to adjust by they offset
    const tileCenter = this.mesh.position;
    const neighborCenter = neighbor.mesh.position;
    const offset = neighborCenter.clone().sub(tileCenter);

    for (let i = tPosition - nPosition; i < tPosition; i++) {
      // Mick - here I changed Z to Y, as we've rotated
      // this.mesh.geometry.attributes.position.setY(
      //   i,
      //   neighbor.mesh.geometry.attributes.position.getY(
      //     i - (tPosition - nPosition) + offset.y
      //   )
      // )
      // copy the entire position vector
        this.mesh.geometry.attributes.position.setXYZ(
            i,  // this is the index of the vertex in the mesh
            neighbor.mesh.geometry.attributes.position.getX(i - (tPosition - nPosition))+offset.x,
            neighbor.mesh.geometry.attributes.position.getY(i - (tPosition - nPosition))+offset.y,
            neighbor.mesh.geometry.attributes.position.getZ(i - (tPosition - nPosition))+offset.z
        )
    }
  }


  // TODO: this fixes the seams, but is not quite right, there are angular and texture discontinuities:
  // http://localhost/sitrec/?custom=http://localhost/sitrec-upload/99999999/Custom-8c549374795aec6f133bfde7f25bad93.json
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

    // the positions are relative to the tile centers
    // so we need to adjust by the offset
    const tileCenter = this.mesh.position;
    const neighborCenter = neighbor.mesh.position;
    const offset = neighborCenter.clone().sub(tileCenter);

    for (let i = nPosition - 1; i < tPosition; i += nPosition) {
      // this.mesh.geometry.attributes.position.setY(
      //   i,
      //   neighbor.mesh.geometry.attributes.position.getY(i - nPosition + 1)  + offset.y
      // )
      // copy the entire position vector
      this.mesh.geometry.attributes.position.setXYZ(
          i,  // this is the index of the vertex in the mesh
          neighbor.mesh.geometry.attributes.position.getX(i - nPosition + 1)+offset.x,
          neighbor.mesh.geometry.attributes.position.getY(i - nPosition + 1)+offset.y,
          neighbor.mesh.geometry.attributes.position.getZ(i - nPosition + 1)+offset.z
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
    this.radius = wgs84.RADIUS; // force this
    this.loadedCallback = options.loadedCallback; // function to call when map is all loaded
    this.loaded = false; // mick flag to indicate loading is finished

    this.tileCache = {};


    this.init(this.options.deferLoad)
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

  init(deferLoad=false) {
    this.center = Utils.geo2tile(this.geoLocation, this.zoom)
    const tileOffset = Math.floor(this.nTiles / 2)
    this.controller = new AbortController();

    for (let i = 0; i < this.nTiles; i++) {
      for (let j = 0; j < this.nTiles; j++) {
        const x = this.center.x + i - tileOffset;
        const y = this.center.y + j - tileOffset;
        // only add tiles that are within the bounds of the map
        // we allow the x values out of range
        // because longitude wraps around
        if (y>0 && y<Math.pow(2,this.zoom)) {
          const tile = new Tile(this, this.zoom, x, y)
          this.tileCache[tile.key()] = tile
          // make the meshes immediately instead of when the tile is loaded
          // because we want to display something while waiting
          tile.buildGeometry()
          tile.buildmesh()
          tile.setPosition(this.center)
          tile.recalculateCurve(wgs84.RADIUS)
          this.scene.add(tile.mesh)
        }
      }
    }

    // we might want to defer this to a later time
    // so we can move the mesh around
    // like, allow the user to drag it, or change the UI values
    if (!deferLoad) {
      this.startLoadingTiles()
    }

    // To abort the loading of tiles, call controller.abort()
    // controller.abort();
  }

  startLoadingTiles() {
    const promises = Object.values(this.tileCache).map(tile => {

          return tile.fetch(this.controller.signal).then(tile => {
            if (this.controller.signal.aborted) {
              // flag that it's aborted, so we can filter it out later
              return Promise.resolve('Aborted');
            }

            // do an initial setting of the vertex positions
            // to accurate EGS84 positions
            // the height map should be loaded by now.
            tile.recalculateCurve(wgs84.RADIUS)

            return tile
          })

        }
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

  // MICK - added to get elevation at a lat/lon
  getElevation(lat, lon) {
    const {x, y} = Utils.geo2tileFraction([lat, lon], this.zoom)
    const intX = Math.floor(x)
    const intY = Math.floor(y)
    const tile = this.tileCache[`${this.zoom}/${intX}/${intY}`]
    if (tile && tile.elevation) {
      const nElevation = Math.sqrt(tile.elevation.length)
      const xIndex = Math.floor((x - tile.x) * nElevation)
      const yIndex = Math.floor((y - tile.y) * nElevation)
      const elevation = tile.elevation[yIndex * nElevation + xIndex]
      return elevation
    }
    return 0  // default to sea level if elevation data not loaded
  }

  // interpolate the elevation at a lat/lon
  // does not handle interpolating between tiles.
  getElevationInterpolated(lat, lon) {
    const {x, y} = Utils.geo2tileFraction([lat, lon], this.zoom)
    const intX = Math.floor(x)
    const intY = Math.floor(y)
    const tile = this.tileCache[`${this.zoom}/${intX}/${intY}`]
    if (tile && tile.elevation) {
      const nElevation = Math.sqrt(tile.elevation.length)
      const xIndex = (x - tile.x) * nElevation
      const yIndex = (y - tile.y) * nElevation
      const x0 = Math.floor(xIndex)
      const x1 = Math.ceil(xIndex)
      const y0 = Math.floor(yIndex)
      const y1 = Math.ceil(yIndex)
      const f00 = tile.elevation[y0 * nElevation + x0]
      const f01 = tile.elevation[y0 * nElevation + x1]
      const f10 = tile.elevation[y1 * nElevation + x0]
      const f11 = tile.elevation[y1 * nElevation + x1]
      const f0 = f00 + (f01 - f00) * (xIndex - x0)
      const f1 = f10 + (f11 - f10) * (xIndex - x0)
      const elevation = f0 + (f1 - f0) * (yIndex - y0)
      return elevation
    }
    return 0  // default to sea level if elevation data not loaded
  }

}

export {Map, Source}
