import { gltfInput } from './input.js';

import { GltfView, computePrimitiveCentroids, loadGltf, loadEnvironment, initKtxLib, initDracoLib } from 'gltf-sample-viewer';

import { UIModel } from './logic/uimodel.js';
import { app } from './ui/ui.js';
import { Observable, from } from 'rxjs';
import { mergeMap, filter } from 'rxjs/operators';
import { gltfModelPathProvider } from './model_path_provider.js';

async function main()
{
    const canvas = document.getElementById("canvas");
    const view = new GltfView(canvas);
    const state = view.createState();

    initDracoLib();
    initKtxLib(view);

    loadEnvironment("assets/environments/footprint_court_512.hdr", view).then( (environment) => {
        state.environment = environment;
    });
    const pathProvider = new gltfModelPathProvider('assets/models/2.0/model-index.json');
    await pathProvider.initialize();

    const uiModel = await new UIModel(app, pathProvider);

    // whenever a new model is selected, load it and when complete pass the loaded gltf
    // into a stream back into the UI
    const gltfLoadedObservable = uiModel.model.pipe(
        mergeMap( gltf_path =>
        {
            return from(loadGltf(gltf_path, view).then( (gltf) => {
                state.gltf = gltf;
                const scene = state.gltf.scenes[state.sceneIndex];
                scene.applyTransformHierarchy(state.gltf);
                computePrimitiveCentroids(state.gltf);
                state.userCamera.fitViewToScene(state.gltf, state.sceneIndex);
                state.userCamera.updatePosition();
                state.animationIndices = [0];
                state.animationTimer.start();
                return state.gltf;
                })
            );
        })
    );

    uiModel.attachGltfLoaded(gltfLoadedObservable);

    uiModel.scene.subscribe( scene => {
        state.sceneIndex = scene;
    });

    uiModel.camera.pipe(filter(camera => camera === "User Camera")).subscribe( () => {
        state.cameraIndex = undefined;
    });
    uiModel.camera.pipe(filter(camera => camera !== "User Camera")).subscribe( camera => {
        state.cameraIndex = camera;
    });

    uiModel.tonemap.subscribe( tonemap => {
        state.renderingParameters.toneMap = tonemap;
    });

    uiModel.debugchannel.subscribe( debugchannel => {
        state.renderingParameters.debugOutput = debugchannel;
    });

    uiModel.skinningEnabled.subscribe( skinningEnabled => {
        state.skinningEnabled = skinningEnabled;
    });

    uiModel.morphingEnabled.subscribe( morphingEnabled => {
        state.morphingEnabled = morphingEnabled;
    });

    uiModel.iblEnabled.subscribe( iblEnabled => {
        state.renderingParameters.useIBL = iblEnabled;
    });

    uiModel.punctualLightsEnabled.subscribe( punctualLightsEnabled => {
        state.renderingParameters.usePunctual = punctualLightsEnabled;
    });

    uiModel.environmentEnabled.subscribe( environmentEnabled => {
        state.renderingParameters.environmentBackground = environmentEnabled;
    });

    uiModel.environmentRotation.subscribe( environmentRotation => {
        switch (environmentRotation)
        {
        case "+Z":
            state.renderingParameters.environmentRotation = 90.0;
            break;
        case "-X":
            state.renderingParameters.environmentRotation = 180.0;
            break;
        case "-Z":
            state.renderingParameters.environmentRotation = 270.0;
            break;
        case "+X":
            state.renderingParameters.environmentRotation = 0.0;
            break;
        }
    });


    uiModel.clearColor.subscribe( clearColor => {
        state.renderingParameters.clearColor = clearColor;
    });

    uiModel.animationPlay.subscribe( animationPlay => {
        if(animationPlay)
        {
            state.animationTimer.unpause();
        }
        else
        {
            state.animationTimer.pause();
        }
    })

    const input = new gltfInput(canvas);
    input.setupGlobalInputBindings(document);
    input.setupCanvasInputBindings(canvas);
    input.onRotate = (deltaX, deltaY) =>
    {
        state.userCamera.rotate(deltaX, deltaY);
        state.userCamera.updatePosition();
    };
    input.onPan = (deltaX, deltaY) =>
    {
        state.userCamera.pan(deltaX, deltaY);
        state.userCamera.updatePosition();
    };
    input.onZoom = (delta) =>
    {
        state.userCamera.zoomIn(delta);
        state.userCamera.updatePosition();
    };
    input.onDropFiles = (mainFile, additionalFiles) => {
        if (mainFile.name.endsWith(".hdr"))
        {
            loadEnvironment(mainFile, view).then( (environment) => {
                state.environment = environment;
                });
        }
        if (mainFile.name.endsWith(".gltf") || mainFile.name.endsWith(".glb"))
        {
            loadGltf(mainFile, view, additionalFiles).then( gltf => {
                state.gltf = gltf;
                const scene = state.gltf.scenes[state.sceneIndex];
                scene.applyTransformHierarchy(state.gltf);
                computePrimitiveCentroids(state.gltf);
                state.userCamera.fitViewToScene(state.gltf, state.sceneIndex);
                state.userCamera.updatePosition();
                state.animationIndices = [0];
                state.animationTimer.start();
                return state.gltf;
            });
        }
    };

    await view.startRendering(state);
}

export { main };