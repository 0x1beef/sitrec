
import {CNodeTerrain} from "../nodes/CNodeTerrain";
import {CNodeView3D} from "../nodes/CNodeView3D";
import {par} from "../par";
import {Sit} from "../Globals";
import {PerspectiveCamera, Color, Vector3, DirectionalLight, HemisphereLight} from "../../three.js/build/three.module";
import {wgs84} from "../LLA-ECEF-ENU";
import * as THREE from "../../three.js/build/three.module";
import {CNodeConstant} from "../nodes/CNode";
import {gui, } from "../Globals";
import {GlobalScene} from "../LocalFrame";
import {SetupGUIFrames} from "../JetGUI";
import {MV3} from "../threeExt";

export const SitSWR = {
    name: "swr",
    menuName: "Skinwalker Ranch",


    azSlider:false,
    jetStuff:false,
    animated:true,

    fps: 29.97,
    frames: 7027,
    aFrame: 0,
    bFrame: 6000,

    lookFOV: 10,

    LOSSpacing:30*4,

    startCameraPosition: [776.1465987669817,1624.3604539633113,29.198848012258352],
    startCameraTarget: [-202.3563163042595,1418.7966350010847,12.598801905451808],

    startDistance: 1,
    startDistanceMax: 6,
    startDistanceMin: 0.1,

    targetSpeed: 10,
    targetSpeedMin: 0,
    targetSpeedMax: 100,

    // SWR
    terrain: {lat: 40.2572028, lon: -109.893759, zoom: 14, nTiles: 4, tileSegments: 256},


//    terrain: {lat: 34.359102, lon: -116.032795, zoom: 12, nTiles: 10, tileSegments: 256},
//    terrain: {lat: 34.331015, lon: -116.092122, zoom: 13, nTiles: 10, tileSegments: 256},


    nodes: {

    },

    mainCamera: {

    },


    setup: function() {

        SetupGUIFrames()

        const farClip = 5000000;


        const mainCamera = new PerspectiveCamera( par.mainFOV, window.innerWidth / window.innerHeight, 1, farClip );
        mainCamera.position.copy(MV3(Sit.startCameraPosition));  //
        mainCamera.lookAt(MV3(Sit.startCameraTarget));

        gui.add(par, 'mainFOV', 0.35, 80, 0.01).onChange(value => {
            mainCamera.fov = value
            mainCamera.updateProjectionMatrix()
        }).listen().name("Main FOV")

        // Duplicate from SetupCommon, but suing gui not guiTweaks
        console.log("+++ radiusMiles Node")
//        new CNodeGUIValue({id:"radiusMiles", value: EarthRadiusMiles, start:4, end:5000, step:1, desc:"Earth Radius"},gui)

        // need to use WGS84 to match terrain, NOT the 7/6 version
        //    new CNodeGUIValue({id:"radiusMiles", value: 3963.190592, start:3963.190592, end:40000, step:1, desc:"Earth Radius"},gui)

        new CNodeConstant({id:"radiusMiles", value: wgs84.radiusMiles})

        new CNodeTerrain({
            id: "TerrainModel",
            radiusMiles: "radiusMiles", // constant
            //terrain:this.terrain,
            lat: this.terrain.lat,
            lon: this.terrain.lon,
            zoom: this.terrain.zoom,
            nTiles: this.terrain.nTiles,
            tileSegments: this.terrain.tileSegments ?? 100,
        }, mainCamera)



        const view = new CNodeView3D({
            id:"mainView",
            //     draggable:true,resizable:true,
            left:0.0, top:0, width:1,height:1,
            fov: 50,
//            background: new Color().setRGB(0.0, 0.3, 0.0),
//            draggable: false, resizable: true, //shiftDrag: true, freeAspect: true,

        //    draggable: false,

        //    shiftDrag: true,
            background: new THREE.Color().setRGB(0.53, 0.81, 0.92),
            camera:mainCamera,
            renderFunction: function() {
                this.renderer.render(GlobalScene, this.camera);
            },

        })
//        view.camera = mainCamera;
        view.addOrbitControls(this.renderer);


        // Lighting
        var light = new DirectionalLight(0xffffff, 0.8);
        light.position.set(100,300,100);
        GlobalScene.add(light);


        const hemiLight = new HemisphereLight(
            'white', // bright sky color
            'darkslategrey', // dim ground color
            0.3, // intensity
        );
        GlobalScene.add(hemiLight);


    }

}
