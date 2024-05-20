// Support functions for the custom sitches

import {FileManager, gui, NodeMan} from "./Globals";
import * as LAYER from "./LayerMasks";
import {TrackManager} from "./TrackManager";
import {assert} from "./utils";
import {isKeyHeld} from "./KeyBoardHandler";
import {ViewMan} from "./nodes/CNodeView";
import {ECEFToLLAVD_Sphere, EUSToECEF} from "./LLA-ECEF-ENU";


export class CCustomManager {
    constructor() {

    }


    setup() {
        // add a lil-gui button linked ot the serialize function
        FileManager.guiFolder.add(this, "serialize").name("Export Custom Sitch")
    }

    serialize() {
        console.log("Serializing custom sitch")
        let out = {}
        // iterate over all the nodes
        // and add and serialization data to the out object
        NodeMan.iterate((id, node) => {
            if (node.serialize !== undefined && node.canSerialize) {
                out[id] = node.serialize()
            }
        })

        // convert to a string
        let str = JSON.stringify(out, null, 2)
        console.log(str)

    }


// per-frame update code for custom sitches
    update(f) {

        // if the camera is following a track, then turn off the object display for that track
        // in the lookView

        const cameraPositionSwitch = NodeMan.get("CameraPositionController");
        // get the selected node
        const choice = cameraPositionSwitch.choice;
        // if the selected node is the track position controller
        if (choice === "Follow Track") {
            // turn off the object display for the camera track in the lookView
            // by iterating over all the tracks and setting the layer mask
            // for the display objects that are associated with the track objects
            // that match the camera track
            const trackPositionMethodNode = cameraPositionSwitch.inputs[choice];
            const trackSelectNode = trackPositionMethodNode.inputs.sourceTrack;
            const currentTrack = trackSelectNode.inputs[trackSelectNode.choice]
            TrackManager.iterate((id, trackObject) => {
                if (trackObject.trackNode.id === currentTrack.id) {
                    assert(trackObject.displayTargetSphere !== undefined, "displayTargetSphere is undefined for trackObject:" + trackObject.trackNode.id);
                    trackObject.displayTargetSphere.changeLayerMask(LAYER.MASK_HELPERS);
                    //console.log("Setting layer mask to MASK_HELPERS for node:" + trackObject.trackNode.id)
                } else {
                    trackObject.displayTargetSphere.changeLayerMask(LAYER.MASK_LOOKRENDER);
                    //console.log("Setting layer mask to MASK_LOOKRENDER for node:" + trackObject.trackNode.id)
                }
                if (trackObject.centerNode !== undefined) {
                    if (trackObject.centerNode.id == currentTrack.id) {
                        trackObject.displayCenterSphere.changeLayerMask(LAYER.MASK_HELPERS);
                        //    console.log("Setting layer mask to MASK_HELPERS for node:" + trackObject.centerNode.id)
                    } else {
                        trackObject.displayCenterSphere.changeLayerMask(LAYER.MASK_LOOKRENDER);
                        //    console.log("Setting layer mask to MASK_LOOKRENDER ("+LAYER.MASK_LOOKRENDER+") for node:" + trackObject.centerNode.id)
                    }
                }
            })
        }


        // handle hold down the t key to move the terrain square around
        if (NodeMan.exists("terrainUI")) {
            const terrainUI = NodeMan.get("terrainUI")
            if (isKeyHeld('t')) {
                const mainView = ViewMan.get("mainView")
                const cursorPos = mainView.cursorSprite.position.clone();
                // convert to LLA
                const ecef = EUSToECEF(cursorPos)
                const LLA = ECEFToLLAVD_Sphere(ecef)

                // only if different
                if (terrainUI.lat !== LLA.x || terrainUI.lon !== LLA.y) {

                    terrainUI.lat = LLA.x
                    terrainUI.lon = LLA.y
                    terrainUI.flagForRecalculation();
                    terrainUI.tHeld = true;
                }
            } else {
                if (terrainUI.tHeld) {
                    terrainUI.tHeld = false;
                    terrainUI.startLoading = true;
                }
            }
        }
    }
}

export const CustomManager = new CCustomManager();
