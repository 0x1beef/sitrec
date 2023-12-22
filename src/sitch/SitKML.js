import {Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Vector3} from "../../three.js/build/three.module";
import {CNodeView3D} from "../nodes/CNodeView3D";
import * as THREE from "../../three.js/build/three.module";
import {par} from "../par";
import {mainCamera, setGlobalPTZ, Sit} from "../Globals";
import {CNodeConstant} from "../nodes/CNode";
import {LLAToEUS, LLAToEUSMAP, LLAVToEUS, wgs84} from "../LLA-ECEF-ENU";
import {CNodeTerrain} from "../nodes/CNodeTerrain";
import {CNodeDisplayTrack} from "../nodes/CNodeDisplayTrack";
import * as LAYER from "../LayerMasks";
import {CNodeLOSTrackTarget} from "../nodes/CNodeLOSTrackTarget";
import {CNodeDisplayTargetSphere} from "../nodes/CNodeDisplayTargetSphere";
import {CNodeScale} from "../nodes/CNodeScale";
import {
    abs,
    atan,
    degrees,
    floor,
    getArrayValueFromFrame, m2f,
    metersFromMiles,
    radians,
    scaleF2M,
    tan,
    utcDate
} from "../utils";
import {CNodeGUIValue, makeCNodeGUIValue} from "../nodes/CNodeGUIValue";
import {CNodeDisplayTrackToTrack} from "../nodes/CNodeDisplayTrackToTrack";
import {CNodeViewUI} from "../nodes/CNodeViewUI";
import {ViewMan} from "../nodes/CNodeView";
import {CNodeDisplayLandingLights} from "../nodes/CNodeDisplayLandingLights";
import {CNodeVideoWebCodecView} from "../nodes/CNodeVideoWebCodec";
import {GlobalScene, LocalFrame} from "../LocalFrame";
import {gui, guiTweaks, } from "../Globals";
import {NodeMan} from "../Globals";
import {SetupGUIFrames} from "../JetGUI";
import {initKeyboard} from "../KeyBoardHandler";
import {MV3, V3} from "../threeExt";
import {CNodeDisplayLOS} from "../nodes/CNodeDisplayLOS";
import {addDefaultLights} from "../lighting";
import {FileManager} from "../CManager";
import {CNodeDisplayTargetModel} from "../nodes/CNodeDisplayTargetModel";
import {CNodeSmoothedPositionTrack, makeTrackFromDataFile} from "../nodes/CNodeTrack";
import {AddTimeDisplayToUI} from "../UIHelpers";
import {setMainCamera} from "../Globals";
import {PTZControls} from "../PTZControls";
import {CNodeCamera, CNodeCameraTrackAzEl, CNodeCameraTrackToTrack} from "../nodes/CNodeCamera";
import {CNodeTrackFromTimed} from "../nodes/CNodeTrackFromTimed";
import {CNodeKMLDataTrack} from "../nodes/CNodeKMLDataTrack";
import {pointAltitude} from "../SphericalMath";
import {CNodeSplineEditor} from "../nodes/CNodeSplineEdit";


export const SitKML = {
    name: "kml",
   // it's a root Sitch, not meant to be used alone, but we can't flag it as "hidden"
    // because that would get inherited - so, we just leave menuName undefined
    // which has the same effect
    azSlider: false,
    jetStuff: false,
    animated: true,
    fps: 30,

    lookFOV: 10,

    showAltitude: true,

    tilt: -15,  //Not a good default!

    defaultCameraDist: 30000,  // for SitKML stuff we generalyl want a large camera distance for defaults

    targetSize: 10000,

    planeCameraFOV:60,

    brightness: 20,

    // this is an override for the mainview setup
    mainView:{left:0.0, top:0, width:.50,height:1},

    skyColor: "rgb(0%,0%,10%)",


//
    setup: function() {

        SetupGUIFrames()

        var mainCamera = new PerspectiveCamera(par.mainFOV, window.innerWidth / window.innerHeight, this.nearClip, this.farClip);
//        var mainCamera = new PerspectiveCamera( par.mainFOV, window.innerWidth / window.innerHeight, 1, 5000000 );


        mainCamera.layers.enable(LAYER.HELPERS)
        setMainCamera(mainCamera); // setting the global value, enabling keyboard controls, etc.

        gui.add(par, 'mainFOV', 0.35, 80, 0.01).onChange(value => {
            mainCamera.fov = value
            mainCamera.updateProjectionMatrix()
        }).listen().name("Main FOV")

        // Duplicate from SetupCommon, but using gui not guiTweaks
        new CNodeConstant({id: "radiusMiles", value: wgs84.radiusMiles})

        if (this.terrain !== undefined) {
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
        }

        const view = new CNodeView3D(Object.assign({
            id: "mainView",
            //     draggable:true,resizable:true,
            left: 0.0, top: 0, width: .5, height: 1,
            fov: 50,
            background: Sit.skyColor,
            camera: mainCamera,

            renderFunction: function () {
                this.renderer.render(GlobalScene, this.camera);
            },

            focusTracks: {
                "Ground (No Track)": "default",
                "Jet track": "cameraTrack",
                "Target Track": "targetTrack",
                "Other Track": "KMLOtherTarget",
            },

        }, Sit.mainView))

        view.addOrbitControls(this.renderer);

        addDefaultLights(Sit.brightness)


        makeTrackFromDataFile("cameraFile", "KMLMainData", "cameraTrack")


        if (FileManager.exists("KMLTarget")) {
            makeTrackFromDataFile("KMLTarget", "KMLTargetData", "targetTrack")
        }

        if (this.targetSpline) {
            new CNodeSplineEditor({
                id: "targetTrack",
//            type:"linear",   // linear or catmull
                type: this.targetSpline.type,   // chordal give smoother velocities
                scene: GlobalScene,
                camera: mainCamera,
                renderer: view.renderer,
                controls: view.controls,
                frames: this.frames,
                terrainClamp: "TerrainModel",

                initialPoints: this.targetSpline.initialPoints,
                initialPointsLLA: this.targetSpline.initialPointsLLA,
            })
        }

        // new CNodeKMLDataTrack({
        //     id:"KMLTargetData",
        //     KMLFile: "KMLTarget",
        // })
        //
        // new CNodeTrackFromTimed({
        //     id:"targetTrack",
        //     timedData: "KMLTargetData",
        // })


// this is equivalent to the above

        // can we do some additional parsing here?
        // like:
        // {"KMLTrack","cameraTrack", {"cameraFile":"cameraFile"}},
        // NodeMan.createNodesJSON(`
        //     [
        //         {"new":"KMLDataTrack",  "id":"KMLMainData",     "KMLFile":"cameraFile"},
        //         {"new":"TrackFromTimed",      "id":"cameraTrack",        "timedData":"KMLMainData"},
        //         {"new":"KMLDataTrack",  "id":"KMLTargetData",   "KMLFile":"KMLTarget"},
        //         {"new":"TrackFromTimed",      "id":"targetTrack",       "timedData":"KMLTargetData"},
        //     ]`);


        // The moving average smoothed target KML track
        // new CNodeSmoothedPositionTrack({ id:"targetTrackAverage",
        //     source: "targetTrack",
        //     smooth: new CNodeGUIValue({value: 200, start:1, end:500, step:1, desc:"Target Smooth Window"},gui),
        //     iterations: new CNodeGUIValue({value: 6, start:1, end:100, step:1, desc:"Target Smooth Iterations"},gui),
        // })

        new CNodeSmoothedPositionTrack({
            id: "targetTrackAverage",
            source: "targetTrack",
            // new spline based smoothing in 3D
            method: "catmull",
//            method:"chordal",
//            intervals: new CNodeGUIValue({value: 119, start:1, end:200, step:1, desc:"Catmull Intervals"},gui),
            intervals: new CNodeGUIValue({value: 20, start: 1, end: 200, step: 1, desc: "Catmull Intervals"}, gui),
            tension: new CNodeGUIValue({value: 0.5, start: 0, end: 5, step: 0.001, desc: "Catmull Tension"}, gui),
        })


        if (FileManager.exists("KMLOther")) {
            NodeMan.createNodesJSON(`
            [
                {"new":"KMLDataTrack",  "id":"KMLOtherData",   "KMLFile":"KMLOther"},
                {"new":"TrackFromTimed",      "id":"KMLOtherTarget",       "timedData":"KMLOtherData"},
            ]`);

            new CNodeDisplayTrack({
                id: "KMLDisplayOtherData",
                track: "KMLOtherData",
                color: new CNodeConstant({value: new THREE.Color(1, 0, 0)}),
                dropColor: new CNodeConstant({value: new THREE.Color(0.8, 0.6, 0)}),
                width: 1,
                //       toGround: 1, // spacing for lines to ground
                ignoreAB: true,
            })

            // Spheres displayed in the main view (helpers)
            new CNodeDisplayTargetSphere({
                track: "KMLOtherTarget",
                size: 2000, color: "blue", layers: LAYER.MASK_HELPERS,
            })


            // plae-sized sphere displaye din look view
            new CNodeDisplayTargetSphere({
                inputs: {
                    track: "KMLOtherTarget",
                    cameraTrack: "cameraTrack",
                    size: new CNodeScale("sizeScaledOther", scaleF2M,
                        new CNodeGUIValue({
                            value: Sit.targetSize,
                            start: 1,
                            end: 1000,
                            step: 0.1,
                            desc: "Other size ft"
                        }, gui)
                    )
                },
                layers: LAYER.MASK_NARONLY,
            })
        }

        //animated segement of camera track
        new CNodeDisplayTrack({
            id: "KMLDisplay",
            track: "cameraTrack",
            color: new CNodeConstant({value: new THREE.Color(1, 1, 0)}),
            width: 2,
            layers: LAYER.MASK_HELPERS,
        })

        new CNodeDisplayTrack({
            id: "KMLDisplayMainData",
            track: "KMLMainData",
            color: new CNodeConstant({value: new THREE.Color(0.7, 0.7, 0)}),
            dropColor: new CNodeConstant({value: new THREE.Color(0.6, 0.6, 0)}),
            width: 1,
            //    toGround:1, // spacing for lines to ground
            ignoreAB: true,
            layers: LAYER.MASK_HELPERS,
        })

        // Segment of target track that's covered by the animation
        // here a thicker red track segment
        new CNodeDisplayTrack({
            id: "KMLDisplayTarget",
            track: "targetTrackAverage",
            color: new CNodeConstant({value: new THREE.Color(1, 0, 0)}),
            width: 4,
            //    toGround:5*30, // spacing for lines to ground
            layers: LAYER.MASK_HELPERS,
        })

        if (NodeMan.exists("KMLTargetData")) {
            new CNodeDisplayTrack({
                id: "KMLDisplayTargetData",
                track: "KMLTargetData",
                color: new CNodeConstant({value: new THREE.Color(1, 0, 0)}),
                dropColor: new CNodeConstant({value: new THREE.Color(0.8, 0.6, 0)}),
                width: 1,
                //      toGround:1, // spacing for lines to ground
                ignoreAB: true,
                layers: LAYER.MASK_HELPERS,
            })
        }


        // Data for all the lines of sight
        // NOT CURRENTLY USED in the KML sitches where we track one KML from another.
        new CNodeLOSTrackTarget({
            id: "JetLOS",
            cameraTrack: "cameraTrack",
            targetTrack: "targetTrackAverage",
            layers: LAYER.MASK_HELPERS,
        })

        // DISPLAY The line from the camera track to the target track
        new CNodeDisplayTrackToTrack({
            id: "DisplayLOS",
            cameraTrack: "cameraTrack",
            targetTrack: "targetTrackAverage",
            color: new CNodeConstant({value: new THREE.Color(1, 1, 1)}),
            width: 1,
            layers: LAYER.MASK_HELPERS,
        })


        if (!Sit.landingLights) {

            // optional target model
            if (Sit.targetObject) {
                new CNodeDisplayTargetModel({
                    track: "targetTrackAverage",
                    TargetObjectFile: Sit.targetObject.file,
                    layers: LAYER.MASK_NAR,
                })
            } else {

                new CNodeDisplayTargetSphere({
                    inputs: {
                        track: "targetTrackAverage",
                        cameraTrack: "cameraTrack",
                        size: new CNodeScale("sizeScaled", scaleF2M,
                            new CNodeGUIValue({
                                value: Sit.targetSize,
                                start: 1,
                                end: 1000,
                                step: 0.1,
                                desc: "Target size ft"
                            }, gui)
                        )
                    },
                    layers: LAYER.MASK_NARONLY,
                })
            }


        } else {
            // landing lights are just a sphere scaled by the distance and the view angle
            // (i.e. you get a brighter light if it's shining at the camera
            new CNodeDisplayLandingLights({
                inputs: {
                    track: "targetTrackAverage",
                    cameraTrack: "cameraTrack",
                    size: new CNodeScale("sizeScaled", scaleF2M,
                        new CNodeGUIValue({
                            value: Sit.targetSize,
                            start: 1000,
                            end: 20000,
                            step: 0.1,
                            desc: "Landing Light Scale"
                        }, gui)
                    )
                },
                layers: LAYER.MASK_NARONLY,
            })
        }


        // Spheres displayed in the main view (helpers)
        new CNodeDisplayTargetSphere({
            track: "targetTrackAverage",
            size: this.cameraSphereSize, color: "blue", layers: LAYER.MASK_HELPERS,
        })
        new CNodeDisplayTargetSphere({
            track: "cameraTrack",
            size: this.cameraSphereSize, color: "yellow", layers: LAYER.MASK_HELPERS,
        })


        if (this.lookFOV !== undefined) {
            //this.lookCamera = new PerspectiveCamera(this.lookFOV, window.innerWidth / window.innerHeight, 1, Sit.farClipNAR);

            const lookCameraDefaults = {
                id: "lookCamera",
                fov: this.planeCameraFOV,
                aspect: window.innerWidth / window.innerHeight,
                near: this.nearClipNAR,
                far: this.farClipNAR,
                layers: LAYER.MASK_NARONLY,

            }

            if (this.ptz) {
                new CNodeCameraTrackAzEl({
                    ...lookCameraDefaults,

                    cameraTrack: "cameraTrack",

                })
            } else {
                new CNodeCameraTrackToTrack({
                    ...lookCameraDefaults,

                    cameraTrack: "cameraTrack",
                    targetTrack: "targetTrackAverage",
                    tilt: makeCNodeGUIValue("tilt", Sit.tilt ?? 0, -30, 30, 0.01, "Tilt", gui),

                })
            }

            this.lookCamera = NodeMan.get("lookCamera").camera // TEMPORARY
        }


        if (this.ptz) {
            setGlobalPTZ(new PTZControls({
                    az: this.ptz.az,
                    el: this.ptz.el,
                    fov: this.ptz.fov,
                    roll: this.ptz.roll,
                    camera: this.lookCamera,
                    showGUI: this.ptz.showGUI
                },
                gui
            ))
        }

        var viewNar;

        if (this.ptz) {
            viewNar = new CNodeView3D(Object.assign({
                id: "NARCam",
                draggable: true, resizable: true,
                left: 0.75, top: 0, width: -9 / 16, height: 1,
                camera: this.lookCamera,
                //cameraTrack: "cameraTrack",
                doubleClickFullScreen: false,
                background: new Color('#132d44'),
            }, Sit.lookView))
        } else {
            viewNar = new CNodeView3D(Object.assign({
                id: "NARCam",
                visible: true,
                draggable: true, resizable: true, freeAspect: true,

                left: 0.75, top: 0, width: -9 / 16, height: 1,
                background: Sit.skyColor,
                up: [0, 1, 0],
                radiusMiles: "radiusMiles", // constant
                syncVideoZoom: true,

                // patch in the FLIR shader effect if flagged, for Chilean
                // Note this has to be handled in the render function if you override it
                // See Chilean for example
                effects: this.useFLIRShader ? {FLIRShader: {},} : undefined,


                camera: NodeMan.get("lookCamera").camera,  // PATCH

                renderFunction: function (frame) {
                    // bit of a patch to get in the FOV
                    if (Sit.chileanData !== undefined) {
                        // frame, mode, Focal Leng
                        var focalLength = getArrayValueFromFrame(Sit.chileanData, 0, 2, frame)
                        const mode = getArrayValueFromFrame(Sit.chileanData, 0, 1, frame);

                        // See: https://www.metabunk.org/threads/the-shape-and-size-of-glare-around-bright-lights-or-ir-heat-sources.10596/post-300052
                        var vFOV = 2 * degrees(atan(675 * tan(radians(0.915 / 2)) / focalLength))

                        if (mode !== "IR") {
                            vFOV /= 2;  /// <<<< TODO - figure out the exact correction. IR is right, but EOW/EON is too wide
                        }
                        this.camera.fov = vFOV;
                        this.camera.updateProjectionMatrix()
                    }

                    const cameraTrack = NodeMan.get("cameraTrack")
                    const focal_len = cameraTrack.v(frame).focal_len;
                    if (focal_len != undefined) {
                        const f = focal_len;
                        const referenceFocalLength = 166;               // reference focal length
                        const referenceFOV = radians(5)         // reference FOV angle
                        const sensorSize = 2 * referenceFocalLength * tan(referenceFOV / 2)

                        const vFOV = degrees(2 * atan(sensorSize / 2 / focal_len))

//                        console.log(focal_len + " -> " + vFOV)

                        this.camera.fov = vFOV;
                        this.camera.updateProjectionMatrix()

                    }

                    // PATCH look at a point
                    if (Sit.toLat !== undefined) {
                        // This is a PATCH, but handle cases with no radius
                        // which is probably all of them
                        // as we are using a terrain, hence WGS84
                        var radius = wgs84.RADIUS
                        if (this.in.radiusMiles != undefined) {
                            metersFromMiles(this.in.radiusMiles.v0)
                        }
                        var to = LLAToEUSMAP(Sit.toLat,
                            Sit.toLon,
                            Sit.toAlt,
                            radius
                        )
                        this.camera.lookAt(to)
                        if (this.in.tilt !== undefined) {
                            const tilt = this.in.tilt.v0
                            this.camera.rotateX(-radians(tilt))
                        }
                    }

                    // extract camera angle
                    var _x = V3()
                    var _y = V3()
                    var _z = V3()
                    this.camera.matrix.extractBasis(_x, _y, _z)  // matrix or matrixWorld? parent is GlobalScene, so

                    var heading = -degrees(Math.atan2(_z.x, _z.z))
                    if (heading < 0) heading += 180;
                    par.az = heading;

                    if (this.visible) {
                        if (this.effectsEnabled)
                            this.composer.render();
                        else
                            this.renderer.render(GlobalScene, this.camera);
                    }

                    //this.renderer.render(GlobalScene, this.camera);


                },

            }, Sit.lookView))
        }


        var labelVideo = new CNodeViewUI({id: "labelVideo", overlayView: ViewMan.list.NARCam.data});
        AddTimeDisplayToUI(labelVideo, 50, 96, 2.5, "#f0f000")
        labelVideo.addText("az", "35° L", 47, 7).listen(par, "az", function (value) {
            this.text = "Az " + (floor(0.499999 + abs(value))) + "° " //+ (value > 0 ? "R" : "L");
        })

        if (this.showAltitude) {
            labelVideo.addText("alt", "---", 20, 7).listen(par, "cameraAlt", function (value) {
                this.text = "Alt " + (floor(0.499999 + abs(value))) + "m";
            })
        }


        labelVideo.setVisible(true)

        gui.add(this, 'planeCameraFOV', 0.35, 80, 0.01).onChange(value => {
            this.lookCamera.fov = value
            this.lookCamera.updateProjectionMatrix()
        }).listen().name("Plane Camera FOV")

        if (Sit.videoFile !== undefined) {
            new CNodeVideoWebCodecView(Object.assign({
                    id: "video",
                    inputs: {
                        zoom: new CNodeGUIValue({
                            id: "videoZoom",
                            value: 100, start: 100, end: 2000, step: 1,
                            desc: "Video Zoom %"
                        }, gui)
                    },
                    visible: true,
                    left: 0.5, top: 0, width: -9 / 16, height: 1,
                    draggable: true, resizable: true,
                    frames: Sit.frames,
                    videoSpeed: Sit.videoSpeed,
                    file: Sit.videoFile,

                },Sit.videoView)
            )
        }


        //mainCamera.position.copy(MV3(Sit.startCameraPosition));  //
        //mainCamera.lookAt(MV3(Sit.startCameraTarget));

        if (this.startCameraPosition !== undefined) {
            mainCamera.position.copy(MV3(this.startCameraPosition));  //
            mainCamera.lookAt(MV3(this.startCameraTarget));
        }

        if (this.startCameraPositionLLA !== undefined) {
            mainCamera.position.copy(LLAVToEUS(MV3(this.startCameraPositionLLA)))
            mainCamera.lookAt(LLAVToEUS(MV3(this.startCameraTargetLLA)));
        }

        initKeyboard();
    },

    update: function(f) {
        const lookCamera = NodeMan.get("lookCamera")
        const lookPos = lookCamera.camera.position;
        const altMeters = pointAltitude(lookPos)

        par.cameraAlt = altMeters;
    }


}
