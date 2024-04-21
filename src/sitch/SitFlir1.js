import {getArrayValueFromFrame,  scaleF2M, tan} from "../utils";
import {Sit, NodeMan, guiTweaks, FileManager} from "../Globals";
import {CNodeGUIValue} from "../nodes/CNodeGUIValue";
import {par} from "../par";
import * as LAYER from "../LayerMasks";
import {gui} from "../Globals";
import {GlobalScene} from "../LocalFrame";
import {
    curveChanged,
    initJetVariables,
    initViews,
    SetupTrackLOSNodes,
} from "../JetStuff";
import {CNodeDisplayTargetModel} from "../nodes/CNodeDisplayTargetModel";
import {CNodeScale} from "../nodes/CNodeScale";
import {CNodeDisplayTargetSphere} from "../nodes/CNodeDisplayTargetSphere";
import {AddAltitudeGraph, AddSpeedGraph, AddTailAngleGraph, AddTargetDistanceGraph} from "../JetGraphs";
import {CNodeATFLIRUI} from "../nodes/CNodeATFLIRUI";
import {ViewMan} from "../nodes/CNodeView";
import {CNodeDisplayLOS} from "../nodes/CNodeDisplayLOS";
import {V3} from "../threeExt";
import {LLAToEUS} from "../LLA-ECEF-ENU";

export const SitFlir1 = {
    name:"flir1",
    menuName: "FLIR1/Nimitz/Tic-Tac",
    isTextable: false,


    fps: 29.97,
    frames: 2289,
    aFrame: 0,
    bFrame: 2288,
    startDistance:15,
    azSlider:{defer:true},

    mainCamera: {
        startCameraPosition: [-126342.63, 56439.02, 101932.66],
        startCameraTarget: [-126346.69, 56137.48, 100979.21],
    },


    terrain: {lat:   31.605, lon:-117.870, zoom:7, nTiles:6},

    // need this if we don't have terrain (for testing)
    // lat: 31.205,
    // lon:-117.870,

    // jetLat: 31.205,
    // jetLon:-117.870,




    files: {
        Flir1Az: 'flir1/FLIR1 AZ.csv',
   //     Flir1El: 'flir1/FLIR1 EL.csv',
        DataFile: 'flir1/Flir1 FOV Data.csv',
        TargetObjectFile: './models/FA-18F.glb',
        ATFLIRModel: 'models/ATFLIR.glb',
        FA18Model: 'models/FA-18F.glb',
    },
    videoFile: "../sitrec-videos/public/f4-aspect-corrected-242x242-was-242x216.mp4",


    lookCamera: {},


    mainView: {left: 0, top: 0, width: 1, height: 1, background: [0.05, 0.05, 0.05]},
    lookView: {left: 0.653, top: 1 - 0.3333, width: -1., height: 0.3333,},

    videoView: {left: 0.8250, top: 0.6666, width: -1, height: 0.3333,},

    focusTracks:{
        "Ground (no track)": "default",
        "Jet track": "jetTrack",
        "Traverse Path (UFO)": "LOSTraverseSelect"
    },

    include_JetLabels: true,

    jetTAS:     {kind: "GUIValue", value: 333, start: 320, end: 360, step: 0.1, desc: "TAS"},
    elStart:    {kind: "GUIValue", value:5.7, start:4.5,  end: 6.5,  step: 0.001,  desc:"el Start"},
    elEnd:      {kind: "GUIValue", value: 5,  start:4.5,  end: 6.5,   step:0.001,  desc: "el end"},
    elNegate:   {kind: "GUIFlag",  value:false, desc: "Negate Elevation"},

    elNormal:   {kind: "Interpolate",  start:"elStart", end:"elEnd"},
    el:         {kind: "Math", math: "$elNormal * ($elNegate ? -1 : 1)"},

    azRawData:  {kind: "arrayFromKeyframes", file: "Flir1Az", stepped: true},
    azData:     {kind: "arrayFromKeyframes", file: "Flir1Az"},

    azEditor: { kind: "CurveEditor",
        visible: true,
        left:0, top:0.5, width:-1,height:0.5,
        draggable:true, resizable:true, shiftDrag: true, freeAspect: true,
        editorConfig: {
            useRegression:true,
            minX: 0, maxX: "Sit.frames", minY: -10, maxY: 10,
            xLabel: "Frame", xStep: 1, yLabel: "Azimuth", yStep: 5,
            points:[0,3.92,352.26,4.687,360.596,3.486,360.596,2.354,1009.858,1.347,1009.858,0.226,1776.31,-4.125,1776.31,-5.246,2288,-8.402,2189,-8.402],
        },
        frames: -1, // -1 will inherit from Sit.frames
    },

    azLinear: { kind: "Interpolate", start: 5, end: -8,},

    azSources: { kind: "Switch",
        inputs: {
            'Az Editor': "azEditor",
            'Az FLIR Video': "azData",
            'Linear': "azLinear",
        },
        desc: "Azimuth Type"
    },

    userBank: {kind: "GUIValue",value: 0, desc: "User Bank Angle", start: -5, end: 5, step: 0.1},

    bank: { kind: "Switch",
        inputs: {
            "User Bank Angle": "userBank",
        },
        desc: "Bank Angle Type"
    },

    // Note, using an anonymous node definition for the speed parameter
    // this will automatically create a node with the given parameters
    // and give it a unique ID.
    turnRateBS: {kind: "TurnRateBS",
        inputs: {
            speed: { kind: "parWatch", watchID: "TAS"},
            bank: "bank"
        }
    },

    // Green line is the original smoothed data
    azDataSeries:{kind:"addGraphSeries", graph: "azEditor", source: "azData", color: "#008000"},

    // red line is raw data
    azRawDataSeries:{kind:"addGraphSeries", graph: "azEditor", source: "azRawData", color: "#800000"},

    // blue line is the value of az that is actually uses, i.e. the output of the switch "azSources"
    azSourcesSeries:{kind:"addGraphSeries", graph: "azEditor", source: "azSources", color: "#008080"},

    // blue stepped line is the final value, but rounded to the nearest integer
    // so it's the value displayed as Az in the ATFLIR UI
    azStepsSeries:{kind:"addGraphSeries", graph: "azEditor", color: "#008080", source:
            {kind: "Math", math: "round($azSources)"},
    },


    // jetLat: 31.205,
    // jetLon:-117.870,
    jetLat: {kind: "Constant", value: 31.205},
    jetLon: {kind: "Constant", value: -117.870},
    jetAltitude: {kind: "inputFeet",value: 20000, desc: "Altitude", start: 19500, end: 20500, step: 1},

    // JetOrigin uses the above three nodes to set the initial position of the jet
    jetOrigin: {kind: "TrackFromLLA", lat: "jetLat", lon: "jetLon", alt: "jetAltitude"},



    targetWind: { kind: "Wind",from: 0, knots: 100, name: "Target", arrowColor: "cyan", lock: "localWind"},
    localWind:  { kind: "Wind", from: 0, knots: 70,  name: "Local",  arrowColor: "cyan", lock: "targetWind"},
    lockWind: {kind: "GUIFlag", value: false, desc: "Lock Wind"},

    initialHeading: { kind: "Heading", heading: 227, name: "Initial", jetOrigin: "jetOrigin", arrowColor: "green" },

    turnRate: {kind: "Switch",
        inputs: {
            //        "Curve Editor": turnRateEditorNode,
            "User Constant": { kind: "GUIValue", value: 0, desc: "User Turn Rate", start: -3, end: 3, step: 0.001},
            "From Bank and Speed": "turnRateBS",
        },
        desc: "Turn Rate Type"
    },



    jetTrack: { kind: "JetTrack",
        inputs: {
            speed: "jetTAS",
            altitude: "jetAltitude",
            turnRate: "turnRate",
            radius: "radiusMiles",
            wind: "localWind",
            heading: "initialHeading",
            origin: "jetOrigin",
        },
    },

    JetLOS: { kind: "LOSTrackAzEl",
        inputs: {
            jetTrack: "jetTrack",
            az: "azSources",
            el: "el",
        }
    },

    traverseNodes: {
        menu: {
            "Constant Air Speed": "LOSTraverseConstantAirSpeed",
            "Constant Ground Speed": "LOSTraverseConstantSpeed",
            "Constant Altitude": "LOSTraverseConstantAltitude",
            "Constant Vc (closing vel)": "LOSTraverse1",
            "Straight Line": "LOSTraverseStraightLine",
            "Fixed Line": "LOSTraverseStraightLineFixed",
        },
        default: "Constant Air Speed",
    },
    // ************************************************************************************
    // ************************************************************************************

    setup: function () {


// Optionally we set the Jet origin to a particular Lat/Lon
// this only makes sense if we have a terrain loaded
// Example usage is in SitFlir1.js
        // TODO - make common for other sitches
        // if (Sit.jetLat !== undefined) {
        //
        //     const jetAltitude = NodeMan.get("jetAltitude").v();
        //     console.log("Initial jet alitide from jetAltitude node = "+jetAltitude)
        //     var enu = LLAToEUS(Sit.jetLat, Sit.jetLon, jetAltitude)
        //     Sit.jetOrigin = V3(enu.x, enu.y, enu.z)
        //     console.log (" enu.y="+enu.y)
        // }

        Sit.flir1Data = FileManager.get("DataFile")

        SetupTrackLOSNodes()

        NodeMan.get("lookCamera").addController("TrackToTrack", {
            sourceTrack: "JetLOS",
            targetTrack: "LOSTraverseSelect",
        })

        NodeMan.get("lookView").renderFunction = function(frame) {

            // bit of a patch to get in the FOV
            if (Sit.flir1Data !== undefined) {
                // frame, mode, Focal Leng
                var focalMode = getArrayValueFromFrame(Sit.flir1Data,0,2,frame)
                var mode = getArrayValueFromFrame(Sit.flir1Data,0,1,frame)
                var zoom = getArrayValueFromFrame(Sit.flir1Data,0,3,frame)

                var vFOV = 0.7;
                if (focalMode === "MFOV") vFOV = 3;
                if (focalMode === "WFOV") vFOV = 6
                if (zoom === "2") vFOV /= 2

                this.camera.fov = vFOV;
                this.camera.updateProjectionMatrix()
            }
            this.renderer.render(GlobalScene, this.camera);
        }

        var ui = new CNodeATFLIRUI({
            id: "ATFLIRUIOverlay",
            jetAltitude: "jetAltitude",

            overlayView: ViewMan.list.lookView.data,
            defaultFontSize: 3.5,
            defaultFontColor: '#E0E0E0',
            defaultFont: 'sans-serif',
            timeStartMin: 41,
            timeStartSec: 35,
            altitude: 20000,
            syncVideoZoom: true,

        });

        new CNodeDisplayTargetModel({
            track: "LOSTraverseSelect",
            TargetObjectFile: "TargetObjectFile",
            wind:"targetWind",
            tiltType: "banking",
        })

          new CNodeDisplayTargetSphere({
             inputs: {
                 track: "LOSTraverseSelect",
                 size: new CNodeScale("sizeScaled", scaleF2M,
                     new CNodeGUIValue({
                         value: Sit.targetSize,
                         start: 0,
                         end: 500,
                         step: 0.1,
                         desc: "Target size ft"
                     }, gui)
                 )
             },

             layers: LAYER.MASK_LOOK,
         })

        AddTailAngleGraph(
            { // mungeInputs
                targetTrack: "LOSTraverseSelect",
                cameraTrack: "jetTrack",
                wind: "targetWind",
            },
            { // windowParams
                left: 0.0, top: 0, width: .3, height: .25,
                visible: true, draggable: true, resizable: true, shiftDrag: false, freeAspect: true,
            },
            { // editor Params
                    maxY: 90
            },
        );

        AddTargetDistanceGraph(
            {
                targetTrack: "LOSTraverseSelect",
                cameraTrack: "jetTrack",
            },
            {
                left: 0.0, top: 0.25, width: .3, height: .33,
            },
            {
                    maxY: 30,
            }

        );

        new CNodeDisplayLOS({
            inputs: {
                LOS: "JetLOS",
            },
            clipSeaLevel: false,
            //     highlightLines:{369:makeMatLine(0xff0000,2)}, // GoFast first frame with RNG

            color: 0x308080,
            spacing: 120,

        })

        AddAltitudeGraph(20000,35000)
        AddSpeedGraph("LOSTraverseSelect","Target Speed",0,500,0.60,0,-1,0.25)


        initJetVariables();

        // initViews relies on some other views setup in the init() fucntion
        // which needs "jetstuff"
        initViews()

    //    guiTweaks.add(par, 'lockCameraToJet').listen().name("Lock Camera to Jet");


        guiTweaks.add(par, 'jetPitch', -8, 8, 0.01).onChange(function () {
            curveChanged();
           // calculateGlareStartAngle();
            par.renderOne = true;
        }).listen().name('Jet Pitch')

        ///////////////////////
    }
}