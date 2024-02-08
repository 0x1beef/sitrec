import {par} from "../par";
import {Sit} from "../Globals";
import * as LAYER from "../LayerMasks";
import {CNodeDisplayTargetSphere, CNodeLOSTargetAtDistance} from "../nodes/CNodeDisplayTargetSphere";
import {CNodeScale} from "../nodes/CNodeScale";
import {
    atan,
    degrees,
    getArrayValueFromFrame,
    radians,
    scaleF2M,
    tan,
} from "../utils";
import {CNodeGUIValue, makeCNodeGUIValue} from "../nodes/CNodeGUIValue";
import {CNodeDisplayLandingLights} from "../nodes/CNodeDisplayLandingLights";
import {GlobalScene} from "../LocalFrame";
import {gui} from "../Globals";
import {NodeMan} from "../Globals";
import {V3} from "../threeExt";
import {pointAltitude} from "../SphericalMath";


export const SitKML = {
    name: "kml",
   // it's a root Sitch, not meant to be used alone, but we can't flag it as "hidden"
    // because that would get inherited - so, we just leave menuName undefined
    // which has the same effect
    fps: 30,
    isSitKML: true,

    terrain: {},

    lookCamera: {
        fov: 10, // this is the default, but we can override it with a new lookCamera object
    },

    // we add empty defintions to define the order of in which things are created
    // other sitches that uses this as a base class must override these
    // we need mainView specifically as some things use it when created
    mainCamera: {},
    mainView: {},  // Mainview is first, as it's often full-screen
    lookView: {},

    videoView: {left: 0.5, top: 0, width: -9 / 16, height: 1,},

    focusTracks: {
        "Ground (No Track)": "default",
        "Jet track": "cameraTrack",
        "Target Track": "targetTrack",
        "Other Track": "KMLOtherTarget",
    },

    showAltitude: true,

 //   tilt: -15,  //Not a good default!

    defaultCameraDist: 3000000,  // for SitKML stuff we generalyl want a large camera distance for defaults

    targetSize: 10000,


    skyColor: "rgb(0%,0%,10%)",

    labelView: {id:"labelVideo", overlay: "lookView"},

    setup: function() {


        const view = NodeMan.get("mainView");

        // // displaying the target model or sphere
        // // model will be rotated by the wind vector
        // if (!Sit.landingLights) {
        // } else {
        //     // Has landingLights
        //     // landing lights are just a sphere scaled by the distance and the view angle
        //     // (i.e. you get a brighter light if it's shining at the camera
        //     if (NodeMan.exists("targetTrackAverage")) {
        //         new CNodeDisplayLandingLights({
        //             inputs: {
        //                 track: "targetTrackAverage",
        //                 cameraTrack: "cameraTrack",
        //                 size: new CNodeScale("sizeScaled", scaleF2M,
        //                     new CNodeGUIValue({
        //                         value: Sit.targetSize,
        //                         start: 1000,
        //                         end: 20000,
        //                         step: 0.1,
        //                         desc: "Landing Light Scale"
        //                     }, gui)
        //                 )
        //             },
        //             layers: LAYER.MASK_LOOK,
        //         })
        //     }
        // }


        var viewNar = NodeMan.get("lookView");


        // patch in the FLIR shader effect if flagged, for Chilean
        // Note this has to be handled in the render function if you override it
        // See Chilean for example
        viewNar.effects = this.useFLIRShader ? {FLIRShader: {},} : undefined,


        viewNar.renderFunction = function (frame) {

            // THERE ARE THREE CAMERA MODIFIED IN HERE - EXTRACT OUT INTO Camera Nodes
            // MIGHT NEEED SEPERATE POSITION, ORIENTATION, AND ZOOM MODIFIERS?

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
        }


        if (this.losTarget !== undefined) {
        // ONly used for LAXUAP
            let control = {};
            if (this.losTarget.distance) {
                new CNodeScale("controlLOS", scaleF2M,
                    new CNodeGUIValue({
                        value: this.losTarget.distance,
                        start: 1,
                        end: 100000,
                        step: 0.1,
                        desc: "LOS Sphere dist ft"
                    }, gui))
                control = { distance: "controlLOS" }
            } else if (this.losTarget.altitude) {
                new CNodeScale("controlLOS", scaleF2M,
                    new CNodeGUIValue({
                        value: this.losTarget.altitude,
                        start: 1,
                        end: 40000,
                        step: 0.1,
                        desc: "LOS Sphere alt ft"
                    }, gui))
                control = {altitude: "controlLOS"}
            }


            new CNodeLOSTargetAtDistance ({
                id:"LOSTargetTrack",
                track:this.losTarget.track,
                camera:this.losTarget.camera,
                ...control,
                frame:this.losTarget.frame,
                offsetRadians:radians(this.losTarget.offset),
            })

            new CNodeLOSTargetAtDistance ({
                id:"LOSTargetWithWindTrack",
                track:this.losTarget.track,
                camera:this.losTarget.camera,
//                distance:this.losTarget.distance,
                ...control,
                frame:this.losTarget.frame,
                offsetRadians:radians(this.losTarget.offset),
                wind:"objectWind",
            })

            new CNodeDisplayTargetSphere({
                track:"LOSTargetTrack",
                size: new CNodeScale("sizeScaledLOS", scaleF2M,
                    new CNodeGUIValue({value: this.losTarget.size, start: 0, end: 200, step: 0.01, desc: "LOS Sphere size ft"}, gui)
                ),
                layers: LAYER.MASK_LOOK,
                color: "#00c000"  // green fixed relative to ground
            })

            new CNodeDisplayTargetSphere({
                track:"LOSTargetWithWindTrack",
                size: "sizeScaledLOS",
                layers: LAYER.MASK_LOOK,
                color: "#00ffff"  // cyan = with wind
            })



        }

    },

    update: function(f) {
        const lookCamera = NodeMan.get("lookCamera")
        const lookPos = lookCamera.camera.position;
        const altMeters = pointAltitude(lookPos)

        par.cameraAlt = altMeters;
    }


}
