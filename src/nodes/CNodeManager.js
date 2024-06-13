// we want a node factory to allow for data-driven node creation

import {CManager} from "../CManager";
import {isConsole} from "../../config";
import {CNode} from "./CNode";
import {FileManager, NodeMan, Sit} from "../Globals";
import {assert} from "../assert.js";

export class CNodeManager extends CManager{
    constructor(props) {
        super (props)
        this.UniqueNodeNumber = 0;
        console.log("Instantiating CNodeManager")
    }



    add(id, node) {
        super.add(id, node)
        // todo: for now we're not registering all of the nodes when running as a console app
        assert (isConsole || this.nodeTypes[node.constructor.name.substring(5)] !== undefined,
            "Node type <" + node.constructor.name + "> not registered with node factory")
    }


    validType(type) {
        return this.nodeTypes[type] !== undefined;
    }




    // rename a node without relinking any of the outputs
    // for use with reinterpret
    renameNodeUnsafe(id, newID) {
        assert (!this.exists(newID), "renaming a node " + id + " to something that exists "+newID)
        const node = this.get(id)
        delete this.list[id]
        node.id = newID;
        this.add(newID, node)

        // // relink outputs of the inputs to point to this new node
        // for (let key in node.inputs) {
        //     const inputNode = node.inputs[key];
        //     for (let i=0;i<inputNode.outputs.length; i++) {
        //         if (inputNode.outputs[i] === id) {
        //             inputNode.outputs[i] = newID;
        //             break;
        //         }
        //         assert(false, "Failed to find node "+id+" in outputs for " +inputNode.id)
        //     }
        //
        // }

        return node;

    }


    // Give a node, we create a new node, optionally with this one as an input (as sourceKey in the def)
    // the old node is renamed with "_old", the new node has the old nodes name
    // old will maintain the inputs, with need renaming to reflect
    // new with have old as an input.
    // outputs from old are transferred to new
    // example: reinterpretNode("cameraTrack", "SmoothedPositionTrack", {smooth:30}, "source" )
    reinterpret(id, type, def, sourceKey) {
        const oldID = id+"_old";
        const oldNode = this.renameNodeUnsafe(id, oldID)

        // copy (via reference) the old outputs
        // and clear the old outputs
        const oldOutputs = oldNode.outputs;
        oldNode.outputs = [];

        // if the sourceKey is defined, then we add the old node as an input to the new node
        // using the sourceKey as the input name
        if (sourceKey !== undefined) {
            def[sourceKey] = oldID;
        }

        // if old node is exportable, then new one should also be
        if (oldNode.exportable !== undefined) {
            def.exportable = oldNode.exportable;
        }

        // Copy the id from the old node to the new node
        def.id = id;

        // create the new node
        const newNode = this.create(type,def)

        // just copy over the old output array from the old node to the new node
        // (the old node will now just have one output, to the new node)
        newNode.outputs = oldOutputs;

        // and fix those old outputs to point to the new node
        for (let out of oldOutputs) {
            for (let key in out.inputs) {
                if (out.inputs[key] === oldNode) {
                    out.inputs[key] = newNode;
                }
            }
        }

        oldNode.recalculateCascade(0)

        // if the old node had an export button, then the new node should too
        // and we need to rename the old export button to the _old name
        if (oldNode.exportBaseName !== undefined) {
            // copy over the old node's export button definition
            //newNode.exportBaseName = oldNode.exportBaseName;
            //newNode.exportFunction = oldNode.exportFunction;
            // rename the old button
            oldNode.exportUI.name(newNode.exportBaseName + oldNode.id)
            //newNode.exportUI = FileManager.makeExportButton(newNode, newNode.exportFunction, newNode.exportBaseName + newNode.id)
        }

        return newNode;
    }

    addExportButton(node, exportFunction, base) {
        //note we store the base name so we can change it if
        node.exportBaseName = base;
        node.exportFunction = exportFunction;
        node.exportUI = FileManager.makeExportButton(node, node.exportFunction, node.exportBaseName + node.id)
    }


    // we override the get function to allow passing in a node
    // so we can resolve either a string or the actual node to a node
    // which simplifies the interface
    get(n, assertIfMissing=true) {
        if (n instanceof CNode)
            return n
        else
            return super.get(n, assertIfMissing)
    }


    dumpNodeRecursive(node, depth) {
        var result = "|---".repeat(depth) + node.id + "\n"
        for (const key in node.outputs) {
            const output = node.outputs[key]
            result += this.dumpNodeRecursive(output, depth+1)
        }
        return result;
    }

    dumpNodes() {
        // for each node that has no inputs, call dumpNodeRecursive to print it and all it's outputs
        let result="";
        for (const key in this.list) {
            const node = this.list[key].data
            if (node.inputs === undefined || Object.keys(node.inputs).length === 0) {
                result += this.dumpNodeRecursive(node, 0)
            }
        }
        return result;

    }


    disposeAll() {
        console.log("Disposing all nodes")
        super.disposeAll();
        // a clean slate so we reset the UniqueNodeNumber
        // this is needed for modding, as the node names must be consistent.
        // still issues if the legacy sitch changes the number or order of nodes....
        this.UniqueNodeNumber = 0;
    }

    // if Sit.frames changes, we need to update and recalculate all nodes that use it
    // which we do by updating those have have the useSitFrames flag set
    updateSitFramesChanged() {
        // update them all individually first
        NodeMan.iterate((key, node) => {
            if (node.useSitFrames) {
                node.frames = Sit.frames;
//                console.log("Updating node.frames on "+node.id+"from "+node.frames+" to "+Sit.frames);
            }
        })

        // NodeMan.iterate((key, node) => {
        //     if (node.useSitFrames) {
        //         console.log("Calling recalculateCascade on "+node.id)
        //         node.recalculateCascade();
        //     }
        // })

        // ensure we recalculate all nodes in the correct order
        this.recalculateAllRootFirst()

    }

    nodeDepth(node) {
        let depth = 0;
        let inputs = node.inputs;
        if (Object.keys(inputs).length > 0) {
            depth=1;
            for (let key in inputs) {
                depth = Math.max(depth, this.nodeDepth(inputs[key])+1);
            }
        }
        return depth;
    }

    recalculateAllRootFirst() {
        // we will creat an array indexed by how deep the node is in the tree
        // a node with no inputs is at depth 0
        // a node with inputs that are all at depth 0 is at depth 1, etc
        // we will process the nodes in order of increasing depth
        // so we can recalculate all the nodes in the correct order
        let depthMap = []
        let maxDepth = 0;
        this.iterate((key, node) => {
            let depth = this.nodeDepth(node);
            if (depthMap[depth] === undefined) {
                depthMap[depth] = [];
            }
            depthMap[depth].push(node);
            maxDepth = Math.max(maxDepth, depth);
        })
        //console.log("Max depth = "+maxDepth)
        for (let i=0; i<=maxDepth; i++) {
            let nodes = depthMap[i];
            if (nodes !== undefined) {
                for (let node of nodes) {
                    node.recalculate();
//                    console.log("Recalculated " + node.constructor.name + ":" + node.id + " at depth " + i + ", node.frames = " + node.frames + (node.frameless?" (frameless)":""));
                }
            }
        }
    }
}

