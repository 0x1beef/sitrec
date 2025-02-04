import {Globals, guiMenus, NodeMan, Sit} from "../Globals";
import {AmbientLight, DirectionalLight} from "three";
import {GlobalScene} from "../LocalFrame";
import {CNode} from "./CNode";
import * as LAYER from "../LayerMasks";
import {assert} from "../assert";

// by default this will live in one node "lighting"
export class CNodeLighting extends CNode {
    constructor(v) {
        super(v);

        this.ambientIntensity = v.ambientIntensity ?? 0.05;
        this.IRAmbientIntensity = v.IRAmbientIntensity ?? 0.8;
        this.sunIntensity = v.sunIntensity ?? 0.7;
        this.sunScattering = v.sunScattering ?? 0.6;
        this.ambientOnly = v.ambientOnly ?? false;
        this.atmosphere = v.atmosphere ?? true;
        this.noMainLighting = v.noMainLighting ?? false;

        this.gui = guiMenus.lighting;

        this.addGUIValue("ambientIntensity", 0, 2, 0.01, "Ambient Intensity");
        this.addGUIValue("IRAmbientIntensity", 0, 2, 0.01, "IR Ambient Intensity");
        this.addGUIValue("sunIntensity", 0, 2, 0.01, "Sun Intensity");
        this.addGUIValue("sunScattering", 0, 2, 0.01, "Sun Scattering");
        this.addGUIBoolean("ambientOnly", "Ambient Only");
        this.addGUIBoolean("atmosphere", "Atmosphere");
        this.addGUIBoolean("noMainLighting", "No Lighting in Main View");

        Globals.ambientLight = new AmbientLight(0xFFFFFF, this.ambientIntensity * Math.PI);
        Globals.ambientLight.layers.mask = LAYER.MASK_LIGHTING
        GlobalScene.add(Globals.ambientLight);

        Globals.IRAmbientLight = new AmbientLight(0xFFFFFF, this.IRAmbientIntensity * Math.PI);
        Globals.IRAmbientLight.layers.mask = LAYER.MASK_LIGHTING
        GlobalScene.add(Globals.IRAmbientLight);
        // this light is disabled, and only gets used when rendering an IR viewport
        Globals.IRAmbientLight.visible = false;

        // then sunlight is direct light
        Globals.sunLight = new DirectionalLight(0xFFFFFF, this.sunIntensity * Math.PI);
        Globals.sunLight.layers.mask = LAYER.MASK_LIGHTING
        Globals.sunLight.position.set(0,7000,0);  // sun is along the y axis
        if (Globals.shadowsEnabled) {

            Globals.sunLight.castShadow = true;
            Globals.sunLight.shadow.mapSize.width = 1024;
            Globals.sunLight.shadow.mapSize.height = 1024;
            Globals.sunLight.shadow.camera.near = 0.5;
            Globals.sunLight.shadow.camera.far = 100000;
        }
        GlobalScene.add(Globals.sunLight);

        this.recalculate();

    }


    setIR(on) {
        if (on) {
            Globals.IRAmbientLight.visible = true;
            Globals.ambientLight.visible = false;
            //Globals.sunLight.visible = false;
        } else {
            Globals.IRAmbientLight.visible = false;
            Globals.ambientLight.visible = true;
            //Globals.sunLight.visible = true;
        }
    }

    // for serialization, we don't need to do anything with the variables that were added with addGUIValue (hence addSimpleSerial)
    modSerialize() {
        return {...super.modSerialize()}
    }

    modDeserialize(v) {
        super.modDeserialize(v);
        this.recalculate();
    }


    recalculate(isMain = false) {
        let sunIntensity = this.sunIntensity;
        if (this.ambientOnly)   {
            sunIntensity = 0;
        }

        let ambientIntensity = this.ambientIntensity;


        if (isMain && this.noMainLighting) {
            ambientIntensity = 1;
            sunIntensity = 0;
        }

        // if there's a sunlight node, then that's managing the lights
        // so we pass the values to it
        if (NodeMan.exists("theSun")) {
            const sunNode = NodeMan.get("theSun");
            sunNode.ambientIntensity = ambientIntensity;
            sunNode.sunIntensity = sunIntensity;
            sunNode.ambientOnly = this.ambientOnly;
            sunNode.sunScattering = this.sunScattering;
            sunNode.atmosphere = this.atmosphere;

        } else {
            // otherwise we manage the lights directly
            Globals.ambientLight.intensity = ambientIntensity;
            Globals.sunLight.intensity = sunIntensity;
        }

        // but we manage the IR ambient light directly, as it's somewhat ad-hoc
        // and will vary based on the colors of the local texture
        Globals.IRAmbientLight.intensity = this.IRAmbientIntensity * Math.PI;
    }

}