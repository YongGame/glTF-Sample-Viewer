import { bindCallback, fromEvent, merge } from 'rxjs';
import { map, filter, startWith, pluck } from 'rxjs/operators';
import { glTF } from 'gltf-sample-viewer';
import { ToneMaps, DebugOutput } from '../../../src/Renderer/rendering_parameters';
import { gltfInput } from '../input.js';

import { getIsGltf, getIsGlb, getIsHdr } from 'gltf-sample-viewer';

// this class wraps all the observables for the gltf sample viewer state
// the data streams coming out of this should match the data required in GltfState
// as close as possible
class UIModel
{
    constructor(app, modelPathProvider, state)
    {
        this.app = app;
        this.pathProvider = modelPathProvider;
        this.state = state;

        this.app.models = this.pathProvider.getAllKeys().map(key => {
            return {title: key};
        });

        const dropdownGltfChanged = app.modelChanged$.pipe(
            pluck("event", "msg"),
            startWith("Avocado"),
            map(value => this.pathProvider.resolve(value)),
            map( value => ({mainFile: value, additionalFiles: undefined})),
        );
        this.flavour = app.flavourChanged$.pipe(pluck("event", "msg")); // TODO gltfModelPathProvider needs to be changed to accept flavours explicitely
        this.scene = app.sceneChanged$.pipe(pluck("event", "msg"));
        this.camera = app.cameraChanged$.pipe(pluck("event", "msg"));
        this.environment = app.environmentChanged$.pipe(pluck("event", "msg"));
        this.environmentRotation = app.environmentRotationChanged$.pipe(pluck("event", "msg"));

        this.app.tonemaps = Object.keys(ToneMaps).map((key) => {
            return {title: ToneMaps[key]};
        });
        this.tonemap = app.tonemapChanged$.pipe(
            pluck("event", "msg"),
            startWith(ToneMaps.LINEAR)
        );

        this.app.debugchannels = Object.keys(DebugOutput).map((key) => {
            return {title: DebugOutput[key]};
        });
        this.debugchannel = app.debugchannelChanged$.pipe(
            pluck("event", "msg"),
            startWith(DebugOutput.NONE)
        );

        this.exposure = app.exposureChanged$.pipe(pluck("event", "msg"));
        this.skinningEnabled = app.skinningChanged$.pipe(pluck("event", "msg"));
        this.morphingEnabled = app.morphingChanged$.pipe(pluck("event", "msg"));
        this.iblEnabled = app.iblChanged$.pipe(pluck("event", "msg"));
        this.punctualLightsEnabled = app.punctualLightsChanged$.pipe(pluck("event", "msg"));
        this.environmentEnabled = app.environmentVisibilityChanged$.pipe(pluck("event", "msg"));
        this.addEnvironment = app.addEnvironment$.pipe(map(() => {/* TODO Open file dialog */}));

        const initialClearColor = "#303542";
        this.app.setSelectedClearColor(initialClearColor);
        this.clearColor = app.colorChanged$.pipe(
            filter(value => value.event !== undefined),
            pluck("event", "msg"),
            pluck("target", "value"),
            startWith(initialClearColor),
            map(hex => {
                // convert hex string to rgb values
                var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? [
                    parseInt(result[1], 16),
                    parseInt(result[2], 16),
                    parseInt(result[3], 16)
                ] : null;
            })
        );

        const cameraIndices = this.scene.pipe(map( scene => {
            return this.getCameras(scene);
        }));
        cameraIndices.subscribe( (cameras) => {
            this.app.cameras = cameras;
        });

        this.animationPlay = app.animationPlayChanged$.pipe(pluck("event", "msg"));

        const inputObservables = UIModel.getInputObservables(document.getElementById("canvas"));
        this.model = merge(dropdownGltfChanged, inputObservables.gltfDropped);
        this.hdr = inputObservables.hdrDropped;

        this.variant = app.variantChanged$.pipe(pluck("event", "msg"));
    }

    static getInputObservables(inputDomElement)
    {
        const observables = {};
        fromEvent(inputDomElement, "dragover").subscribe( event => event.preventDefault() ); // just prevent the default behaviour
        const dropEvent = fromEvent(inputDomElement, "drop").pipe( map( event => {
            // prevent the default drop event
            event.preventDefault();
            return event;
        }));
        observables.filesDropped = dropEvent.pipe(map( (event) => {
            // Use DataTransfer files interface to access the file(s)
            return Array.from(event.dataTransfer.files);
        }));
        observables.gltfDropped = observables.filesDropped.pipe(
            // filter out any non .gltf or .glb files
            filter( (files) => files.filter( file => getIsGlb(file.name) || getIsGltf(file.name))),
            map( (files) => {
                // restructure the data by separating mainFile (gltf/glb) from additionalFiles
                const mainFile = files.find( (file) => getIsGlb(file.name) || getIsGltf(file.name));
                const additionalFiles = files.filter( (file) => file !== mainFile);
                return {mainFile: mainFile, additionalFiles: additionalFiles};
            }),
        );
        observables.hdrDropped = observables.filesDropped.pipe(
            map( (files) => {
                // extract only the hdr file from the stream of files
                return files.find( (file) => file.name.endsWith(".hdr"));
            }),
            filter(file => file),
        )
        return observables;
    }

    attachGltfLoaded(glTFLoadedStateObservable)
    {
        const gltfLoadedAndInit = glTFLoadedStateObservable.pipe(
            map( state => state.gltf ),
            startWith(new glTF())
        );

        const sceneIndices = gltfLoadedAndInit.pipe(
            map( (gltf) => {
                return gltf.scenes.map( (scene, index) => {
                    return {title: index};
                });
            })
        );
        sceneIndices.subscribe( (scenes) => {
            this.app.scenes = scenes;
        });

        const loadedSceneIndex = glTFLoadedStateObservable.pipe(
            map( (state) => state.sceneIndex )
        );
        loadedSceneIndex.subscribe( (index) => {
            this.app.setSelectedScene(index);
        });

        const cameraIndices = gltfLoadedAndInit.pipe(
            map( (gltf) => {
                return this.getCameras(this.state.sceneIndex);
            })
        );
        cameraIndices.subscribe( (cameras) => {
            this.app.cameras = cameras;
        });

        const variants = gltfLoadedAndInit.pipe(
            map( (gltf) => {
                if(gltf.variants !== undefined)
                {
                    return gltf.variants.map( (variant, index) => {
                        return {title: variant.name};
                    });
                }
                return [];
            })
        );
        variants.subscribe( (variants) => {
            this.app.materialVariants = variants;
        });

        gltfLoadedAndInit.subscribe(
            (_) => {this.app.setAnimationState(true);
            }
        );

        const xmpData = gltfLoadedAndInit.pipe(
            map( (gltf) => {
                if(gltf.extensions !== undefined && gltf.extensions.KHR_xmp !== undefined)
                {
                    if(gltf.asset.extensions !== undefined && gltf.asset.extensions.KHR_xmp !== undefined)
                    {
                        let xmpPacket = gltf.extensions.KHR_xmp.packets[gltf.asset.extensions.KHR_xmp.packet];
                        return {xmp: xmpPacket};
                    }
                }
                return [];
            })
        );
        xmpData.subscribe( (xmpData) => {
            this.app.xmp = xmpData;
        });
    }

    attachGeneralObservables(sceneChangedObservable)
    {
        sceneChangedObservable.pipe(map(_ => {
            return this.state.cameraIndex;
        })
        );
        sceneChangedObservable.subscribe( (cameraIndex) => {
            if(cameraIndex == undefined)
            {
                cameraIndex = "User Camera";
            }
            this.app.setSelectedCamera(cameraIndex);
        });
    }

    updateStatistics(statisticsUpdateObservable)
    {
        statisticsUpdateObservable.subscribe(
            data => {this.app.statistics =
            [
                {title: "Mesh Count", value: data.meshCount},
                {title: "Triangle Count", value: data.faceCount},
                {title: "Opaque Material Count", value: data.opaqueMaterialsCount},
                {title: "Transparent Material Count", value: data.transparentMaterialsCount}
            ];
            }
        );
    }

    getCameras(cameraIndex)
    {
        let cameraIndices = [{title: "User Camera"}];
        const gltf = this.state.gltf;
        if(gltf === undefined)
        {
            return cameraIndices;
        }
        cameraIndices.push(...gltf.cameras.map( (camera, index) => {
            if(gltf.scenes[cameraIndex].includesNode(gltf, camera.node))
            {
                return {title: index};
            }
        }));
        cameraIndices = cameraIndices.filter(function(el) {
            return el !== undefined;
        });
        return cameraIndices;
    }
}

export { UIModel };
