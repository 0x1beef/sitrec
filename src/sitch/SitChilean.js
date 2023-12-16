import {SitKML} from "./SitKML";
import {AddTailAngleGraph, AddTargetDistanceGraph} from "../JetGraphs";
import {CNodeWind} from "../nodes/CNodeWind";
import {gui, guiTweaks, NodeMan, Sit} from "../Globals";
import {CNodeSmoothedPositionTrack} from "../nodes/CNodeTrack";
import {CNodeGUIValue} from "../nodes/CNodeGUIValue";
import {CNodeDisplayTargetSphere} from "../nodes/CNodeDisplayTargetSphere";
import {CNodeScale} from "../nodes/CNodeScale";
import {degrees, scaleF2M} from "../utils";
import * as LAYER from "../LayerMasks";
import {FileManager} from "../CManager";
import {trackHeading} from "../nodes/CNode";

export const SitChilean = Object.assign(Object.assign({},SitKML),{
    name: "chilean",
    menuName: "Chilean Navy IB 6830",

//    planeCameraFOV: 0.75    ,
    planeCameraFOV: 0.915    ,

    targetSize: 1, // in feet

    tilt: 0,

    useFLIRShader: true,

    frames: 17969,
    terrain: {lat: -33.2611, lon: -71.192388, zoom: 9, nTiles: 8},

   // note files are automatically laaded into a data structure
    // that varies based on the extension
    // e.g. a .csv file will be loaded by FileMan.loadCSV in the
    files: {
        KMLFile: 'chilean/Chile Chopper Track from video GPSTime.kml',
        KMLTarget: "chilean/IB6830 - Incorporating Radar Positions.kml",
        TargetObjectFile: 'models/A340-600-F18Engine.glb',
        DataFile: 'chilean/Chilean Navy Extracted Data 720.csv',

    },
    startTime: "2014-11-11T16:51:55Z",

    startCameraPosition:[-126967.77,61278.38,196946.50],
    startCameraTarget:[-126503.73,61040.85,196093.13],

    videoFile: "../sitrec-videos/public/Chilean Navy 13-51-55 from HD 720p.mp4",
    brightness: 100,
    skyColor: 'skyblue',

    narView: {             left: 0.5, top: 0.5, width: -1920/1080, height: 0.5,},
    videoView: {             left: 0.5, top: 0, width: -1920/1080, height: 0.5,},
   // narView: {             left: 0.6250, top: 0.5, width: -1.8, height: 0.5,},
   // videoView: {             left: 0.6250, top: 0, width: -1.8, height: 0.5,},
    mainView:{left:0.0, top:0, width:0.625,height:1},

     targetObject:{file: "TargetObjectFile",},

    setup2: function() {

        Sit.chileanData = FileManager.get("DataFile")


        // Wind is needed to adjust the target planes heading relative to motion in the TailAngleGraph
        new CNodeWind({
            id: "targetWind",
            from: 270,
            knots: 0,  // can just set to 0 if not needed
            name: "Target",
            arrowColor: "cyan"

        }, guiTweaks)

        AddTailAngleGraph(
            {
                targetTrack: "KMLTargetAverage",
                cameraTrack: "KMLTrack",
                wind: "targetWind",
            },
            {
                left: 0.0, top: 0, width: .15, height: .25,
            }

        );

        AddTargetDistanceGraph(
            {
                targetTrack: "KMLTargetAverage",
                cameraTrack: "KMLTrack",
            },
            {
                left: 0.0, top: 0.25, width: .15, height: .33,
            }

        );

        new CNodeDisplayTargetSphere({
            inputs: {
                track: "KMLTargetAverage",
                size: new CNodeScale("sizeScaled", scaleF2M,
                    new CNodeGUIValue({value: Sit.targetSize, start: 1, end: 1000, step: 0.1, desc: "Target Sphere size ft"}, gui)
                )
            },

            layers: LAYER.MASK_NAR,
        })

    },

    update: function(f) {
        const cameraTrack = NodeMan.get("KMLTrack")
        const targetTrack = NodeMan.get("KMLTargetAverage")


        const posCamera = cameraTrack.p(f)
        const posTarget = targetTrack.p(f)
        const toTarget = posCamera.clone().sub(posTarget)
        const toTargetHeading = degrees(Math.atan2(toTarget.x, -toTarget.z))
        const cameraMotionHeading = trackHeading(cameraTrack,f);
        const azRelative = toTargetHeading-cameraMotionHeading
 //       console.log(azRelative)
    },

})