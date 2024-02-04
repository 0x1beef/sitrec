import {gui, mainCamera, NodeMan, setGlobalPTZ, setMainCamera, Sit} from "./Globals";
import {CNodeConstant, makePositionLLA} from "./nodes/CNode";
import {wgs84} from "./LLA-ECEF-ENU";
import {CNodeGUIValue} from "./nodes/CNodeGUIValue";
import {CNodeTerrain} from "./nodes/CNodeTerrain";
import {Color} from "../three.js/build/three.module";
import {CNodeCamera} from "./nodes/CNodeCamera";
import * as LAYER from "./LayerMasks";
import {makeTrackFromDataFile} from "./nodes/CNodeTrack";
import {CNodeDisplayTrack} from "./nodes/CNodeDisplayTrack";
import {abs, assert, floor, scaleF2M} from "./utils";
import {CNodeView3D} from "./nodes/CNodeView3D";
import {CNodeVideoWebCodecView} from "./nodes/CNodeVideoWebCodecView";
import {DragDropHandler} from "./DragDropHandler";
import {CNodeSplineEditor} from "./nodes/CNodeSplineEdit";
import {GlobalScene} from "./LocalFrame";
import {CNodeScale} from "./nodes/CNodeScale";
import {PTZControls} from "./PTZControls";
import {CNodeDisplayTargetModel} from "./nodes/CNodeDisplayTargetModel";
import {CNodeDisplayTargetSphere} from "./nodes/CNodeDisplayTargetSphere";
import {makeArrayNodeFromColumn} from "./nodes/CNodeArray";
import {par} from "./par";
import {CNodeViewUI} from "./nodes/CNodeViewUI";
import {ViewMan} from "./nodes/CNodeView";
import {AddTimeDisplayToUI} from "./UIHelpers";


export function SituationSetup() {
    console.log("++++++ SituationSetup")

    new CNodeConstant({id:"radiusMiles", value: wgs84.radiusMiles});

    let mainView, mainCameraNode, mainCamera;

    for (let key in Sit) {
//        console.log(key)

        const data = Sit[key];

        // we can have undefined values in Sit, so skip them
        // this normall occurs when we have a base situation, and then override some values
        if (data === undefined) continue;

        function SSLog() {
            console.log("SituationSetup: " + key + " " + JSON.stringify(data))
        }

        if (data.kind !== undefined) {
            // to allown
            // new way of doing it, the "kind" is the kind of thing we want to setup
            // which means the key is the id of the node OR the id of some setup code in the switch statement below
            assert(data.id === undefined, "SituationSetup: data.id is deprecated, use key as id");
            data.id = key;
            key = data.kind;
        }

        switch (key) {


            case "flattening":
                SSLog();
                new CNodeGUIValue({id: "flattening", value: 0, start: 0, end: 1, step: 0.005, desc: "Flattening"}, gui)
                break

            case "terrain":
                SSLog();
                //     terrain: {lat: 37.001324, lon: -102.717053, zoom: 9, nTiles: 8},
                new CNodeTerrain({
                    id: "TerrainModel",
                    radiusMiles: "radiusMiles", // constant
                    lat: data.lat,
                    lon: data.lon,
                    zoom: data.zoom,
                    nTiles: data.nTiles,
                    flattening: Sit.flattening ? "flattening" : undefined,
                    tileSegments: Sit.terrain.tileSegments ?? 100,
                })
                break;

            case "mainCamera":
                SSLog();
                // mainCamera: {
                //     fov:  32,
                //         startCameraPosition: [94142.74587419331,13402.067238703776,-27360.90061964375],
                //         startCameraTarget: [93181.8523901133,13269.122270956876,-27117.982222227354],
                // },
                const cameraNode = new CNodeCamera({
                    id: "mainCamera",
                    fov: data.fov ?? 30,
                    aspect: window.innerWidth / window.innerHeight,
                    near: data.near ?? 1,
                    far: data.far ?? 8000000,
                    layers: data.mask ?? LAYER.MASK_MAINRENDER,

                    // one of these will be undefined. CNodeCamera uses the other
                    startPos: data.startCameraPosition,
                    lookAt: data.startCameraTarget,
                    startPosLLA: data.startCameraPositionLLA,
                    lookAtLLA: data.startCameraTargetLLA,

                })

                mainCameraNode = cameraNode;
                mainCamera = mainCameraNode.camera;

                // setMainCamera(cameraNode.camera) // eventually might want to remove this and be a node

                gui.add(cameraNode.camera, 'fov', 0.35, 80, 0.01).onChange(value => {
                    cameraNode.camera.updateProjectionMatrix()
                }).listen().name("Main FOV")
                break;

            case "lookCamera":
                SSLog();
                new CNodeCamera({
                    id: "lookCamera",
                    fov: data.fov ?? 10,
        //            aspect: window.innerWidth / window.innerHeight,
                    near: data.near ?? 1,
                    far: data.far ?? 8000000,
                    layers: data.mask ?? LAYER.MASK_LOOKRENDER,
                    //                   layers: data.mask ?? LAYER.MASK_MAIN_HELPERS,
                })

                const lookCameraNode = NodeMan.get("lookCamera");
                if (data.addFOVController) {
                    gui.add(lookCameraNode.camera, 'fov', 0.35, 80, 0.01).onChange(value => {
                        lookCameraNode.camera.updateProjectionMatrix()
                    }).listen().name("Look Camera FOV")
                }

                break;

            // cameraTrack: {
            //     id: "cameraTrack",
            //         file: "cameraFile",
            // },
            case "cameraTrack":
                SSLog();
                assert(Sit.lat !== undefined && Sit.lon !== undefined, "SituationSetup: cameraTrack needs Sit.lat and Sit.lon defined. i.e. after terrain");

                const id = data.id ?? "cameraTrack";
                if (data.LLA !== undefined) {
                    makePositionLLA(id, data.LLA[0], data.LLA[1], data.LLA[2]);
                } else {
                    const file = data.file ?? "cameraFile";

                    makeTrackFromDataFile(file, id + "Data", id);
                    new CNodeDisplayTrack({
                        id: id + "Display",
                        track: id,
                        color: [1, 1, 0],
                        width: 2,
                    })

                    new CNodeDisplayTrack({
                        id: id + "DisplayData",
                        track: id+"Data",
                        color: [0.7, 0.3, 0],
                        width: 1,
                        ignoreAB: true,
                    })



                }
                break;

            // focalLenController: {source: "cameraTrack", object: "lookCamera", len: 166, fov: 5},
            case "focalLenController":
                SSLog();
                NodeMan.get(data.object).addController("FocalLength", {
                    focalLength: data.source,
                    referenceFocalLength: data.len,
                    referenceFOV: data.fov,
                })
                break;

            case "mainView":
                SSLog();
                const mainViewDef = {
                    id: "mainView",
                    //     draggable:true,resizable:true,
                    left: 0.0, top: 0, width: .5, height: 1,
                    fov: 50,
                    background: data.background ?? Sit.skyColor,
                    camera: "mainCamera",
                    ...data,
                }
                const view = new CNodeView3D(mainViewDef);
                view.addOrbitControls(Sit.renderer);
                mainView = view;
                break;

            case "lookView":
                SSLog();

                var color = Sit.skyColor

                // if we have a mainView, then use its background color
                if (NodeMan.exists("mainView")) {
                    color = NodeMan.get("mainView").background;
                }

                const lookViewDef = {
                    id: "lookView",
                    //     draggable:true,resizable:true,
                    left: 0.75, top: 0, width: .25, height: 1,
                    fov: 50,
                    background: color,
                    camera: "lookCamera",
                    syncVideoZoom: true,
                    ...data,
                }
                const lookView = new CNodeView3D(lookViewDef);
                lookView.addOrbitControls(Sit.renderer);
                break;

            case "videoView":
                SSLog();
                assert(Sit.videoFile !== undefined, "videoView needs a video file")
                new CNodeVideoWebCodecView({
                        id: "video",
                        inputs: {
                            zoom: new CNodeGUIValue({
                                id: "videoZoom",
                                value: 100, start: 100, end: 2000, step: 1,
                                desc: "Video Zoom %"
                            }, gui)
                        },
                        visible: true,
                        draggable: true, resizable: true,
                        frames: Sit.frames,
                        videoSpeed: Sit.videoSpeed,
                        file: Sit.videoFile,
                        ...data,
                    }
                )
                break;

            case "focusTracks":
                SSLog();
                NodeMan.get("mainView").addFocusTracks(data);

                break;

            // need to implement views first, as the spline editor needs a renderer and controls
            case "targetSpline":
                SSLog();
                assert(mainView !== undefined, "SituationSetup: targetSpline needs a mainView defined");
                assert(mainCamera !== undefined, "SituationSetup: targetSpline needs a mainCamera defined");
                new CNodeSplineEditor({
                    id: data.id ?? "targetTrack",
                    type: data.type,   // chordal give smoother velocities
                    scene: GlobalScene,
                    camera: "mainCamera",
                    view: mainView,
                    renderer: mainView.renderer,
                    controls: mainView.controls,
                    frames: Sit.frames,
                    terrainClamp: data.terrainClamp ?? "TerrainModel",

                    initialPoints: data.initialPoints,
                    initialPointsLLA: data.initialPointsLLA,
                })
                break;

            case "dragDropHandler":
                if (NodeMan.exists("mainView"))
                    DragDropHandler.addDropArea(NodeMan.get("mainView").div);
                if (NodeMan.exists("lookView"))
                    DragDropHandler.addDropArea(NodeMan.get("lookView").div);
                break;

            case "startDistanceFeet":
                SSLog();
                new CNodeScale(data.id ?? "startDistance", scaleF2M, new CNodeGUIValue(
                    {id: "startDistanceFeet", ...data}, gui))
                break;

            case "sizeFeet":
                SSLog();
                new CNodeScale(data.id ?? "targetSize", scaleF2M, new CNodeGUIValue(
                    {...data, ...{id: "targetSizeFeetGUI"}}, gui))
                break;

            case "ptz":
                SSLog();
                setGlobalPTZ(new PTZControls({
                        az: data.az, el: data.el, fov: data.fov, camera: "lookCamera", showGUI: data.showGUI
                    },
                    gui
                ))
                break;

            case "lookPosition":
                SSLog();
                NodeMan.get("lookCamera").addController("UIPositionLLA", {
                    id:"CameraLLA",
                    fromLat: new CNodeGUIValue({
                        id: "cameraLat",
                        value: data.fromLat,
                        start: -90,
                        end: 90,
                        step: 0.001,
                        desc: "Camera Lat"
                    }, gui),

                    fromLon: new CNodeGUIValue({
                        id: "cameraLon",
                        value: data.fromLon,
                        start: -180,
                        end: 180,
                        step: 0.001,
                        desc: "Camera Lon"
                    }, gui),

                    fromAltFeet: new CNodeGUIValue({
                        id: "cameraAlt",
                        value: data.fromAltFeet,
                        start: data.fromAltFeetMin ?? 0,
                        end: data.fromAltFeetMax ?? 50000,
                        step: 0.1,
                        desc: "Camera Alt (ft)"
                    }, gui),
                    radiusMiles: "radiusMiles",
                })
                break;

            case "lookAt":
                SSLog();
                NodeMan.get("lookCamera").addController("LookAtLLA", {
                    toLat:data.toLat,
                    toLon:data.toLon,
                    toAlt:data.toAlt,
                })
                break;

            case "lookAtTrack":
                SSLog();
                NodeMan.get("lookCamera").addController("LookAtTrack", {
                    targetTrack: data.track ?? "targetTrack",
                })
                break;

            case "trackFromDataFile":
                SSLog();

                makeTrackFromDataFile(data.file, data.dataID, data.id);
                break;

            case "targetObject":
                SSLog();
                new CNodeDisplayTargetModel({
                    track: data.track ?? "targetTrack",
                    TargetObjectFile: data.file,
                  //  ...maybeWind,
                })
                break;

            case "targetSizedSphere":
                SSLog();
                new CNodeDisplayTargetSphere({
                    track:data.targetTrack ?? "targetTrack",
                    size: new CNodeScale("sizeScaledLOS"+data.id, scaleF2M,
                        new CNodeGUIValue({value: data.size??3, start: 0, end: 200, step: 0.01, desc: "LOS Sphere size ft"}, gui)
                    ),
                    layers: LAYER.MASK_LOOK,
                    color: "#FFFFFF"
                })
                break;

                // Take pan and tilt data from a file and use it to control the camera
            case "arrayDataPTZ":
                SSLog();
                const cameraTrack = NodeMan.get(data.arrayNode ?? "cameraTrack");
                const array = cameraTrack.array
                assert (array !== undefined, "arrayDataPTZ missing array object")
                makeArrayNodeFromColumn("headingCol", array, data.heading,30, true)
                makeArrayNodeFromColumn("pitchCol", array, data.pitch, 30, true)
                NodeMan.get(data.camera ?? "lookCamera").addController(
                    "AbsolutePitchHeading",
                    {pitch: "pitchCol", heading: "headingCol"}
                )
                if (data.labelView !== undefined) {
                    const labelView = NodeMan.get(data.labelView)
                    labelView.addText("alt", "---", 0, 5, 5, '#FFFFFF','left').listen(par, "cameraAlt", function (value) {
                        this.text = "Alt " + (floor(0.499999 + abs(value))) + "m";
                    })

                    labelView.addLine("---").listen(par, "az", function (value) {
                        this.text = "Az " + value.toFixed(2) + "°";
                    })

                    labelView.addLine("---").update(function (value) {
                        this.text = "Pitch " + NodeMan.get("pitchCol").v(par.frame).toFixed(2) + "°";
                    })
                }
                break;

            case "labelView":
                SSLog();
                const overlayNode = data.overlay ?? "lookView";
                const overlayView = NodeMan.get(overlayNode);
                var labelVideo = new CNodeViewUI({id: data.id ?? "labelVideo", overlayView: overlayView});
                let textSize = 2.5;
                if (labelVideo.widthPx > labelVideo.heightPx) {
                    textSize = 5
                }
                AddTimeDisplayToUI(labelVideo, 50, 96, textSize, "#f0f000")
                labelVideo.setVisible(true)
                break


    default:
                // check to see if the "kind" is a node type
                // if so, then create a node of that type
                // passing in the data as the constructor
                if (NodeMan.validType(key)) {
                    SSLog();
                    NodeMan.create(key, data);
                };


        }


    }
}

/*
 Nodes can be converted by using this regular expression / replacement

new\s+CNode(\w+)\(\s*\{\s*id:\s*"(\w+)",\s*((.|\s)+?)\}\s*\)

$2: { kind: "$1",\n$3},

 */