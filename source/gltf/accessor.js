import { GL } from '../Renderer/webgl.js';
import { GltfObject } from './gltf_object.js';

class gltfAccessor extends GltfObject
{
    constructor()
    {
        super();
        this.bufferView = undefined;
        this.byteOffset = 0;
        this.componentType = undefined;
        this.normalized = false;
        this.count = undefined;
        this.type = undefined;
        this.max = undefined;
        this.min = undefined;
        this.sparse = undefined;
        this.name = undefined;

        // non gltf
        this.glBuffer = undefined;
        this.typedView = undefined;
        this.filteredView = undefined;
    }

    getTypedView(gltf)
    {
        if (this.typedView !== undefined)
        {
            return this.typedView;
        }

        if (this.bufferView !== undefined)
        {
            const bufferView = gltf.bufferViews[this.bufferView];
            const buffer = gltf.buffers[bufferView.buffer];
            const byteOffset = this.byteOffset + bufferView.byteOffset;

            const componentSize = this.getComponentSize(this.componentType);
            let componentCount = this.getComponentCount(this.type);

            let arrayLength = 0;
            if(bufferView.byteStride !== 0)
            {
                if (componentSize !== 0)
                {
                    arrayLength = bufferView.byteStride / componentSize * (this.count - 1) + componentCount;
                }
                else
                {
                    console.warn("Invalid component type in accessor '" + (this.name ? this.name : "") + "'");
                }
            }
            else
            {
                arrayLength = this.count * componentCount;
            }

            if (arrayLength * componentSize > buffer.buffer.byteLength - byteOffset)
            {
                arrayLength = (buffer.buffer.byteLength - byteOffset) / componentSize;
                console.warn("Count in accessor '" + (this.name ? this.name : "") + "' is too large.");
            }

            switch (this.componentType)
            {
            case GL.BYTE:
                this.typedView = new Int8Array(buffer.buffer, byteOffset, arrayLength);
                break;
            case GL.UNSIGNED_BYTE:
                this.typedView = new Uint8Array(buffer.buffer, byteOffset, arrayLength);
                break;
            case GL.SHORT:
                this.typedView = new Int16Array(buffer.buffer, byteOffset, arrayLength);
                break;
            case GL.UNSIGNED_SHORT:
                this.typedView = new Uint16Array(buffer.buffer, byteOffset, arrayLength);
                break;
            case GL.UNSIGNED_INT:
                this.typedView = new Uint32Array(buffer.buffer, byteOffset, arrayLength);
                break;
            case GL.FLOAT:
                this.typedView = new Float32Array(buffer.buffer, byteOffset, arrayLength);
                break;
            }
        }

        if (this.typedView === undefined)
        {
            console.warn("Failed to convert buffer view to typed view!: " + this.bufferView);
        }
        else if (this.sparse !== undefined)
        {
            this.applySparse(gltf, this.typedView);
        }

        return this.typedView;
    }

    getDeinterlacedView(gltf)
    {
        if (this.filteredView !== undefined)
        {
            return this.filteredView;
        }

        if (this.bufferView !== undefined)
        {
            const bufferView = gltf.bufferViews[this.bufferView];
            const buffer = gltf.buffers[bufferView.buffer];
            const byteOffset = this.byteOffset + bufferView.byteOffset;

            const componentSize = this.getComponentSize(this.componentType);
            const componentCount = this.getComponentCount(this.type);
            const arrayLength = this.count * componentCount;

            let stride = bufferView.byteStride !== 0 ? bufferView.byteStride : componentCount * componentSize;
            let dv = new DataView(buffer.buffer, byteOffset, this.count * stride);

            let func = 'getFloat32';
            switch (this.componentType)
            {
            case GL.BYTE:
                this.filteredView = new Int8Array(arrayLength);
                func = 'getInt8';
                break;
            case GL.UNSIGNED_BYTE:
                this.filteredView = new Uint8Array(arrayLength);
                func = 'getUint8';
                break;
            case GL.SHORT:
                this.filteredView = new Int16Array(arrayLength);
                func = 'getInt16';
                break;
            case GL.UNSIGNED_SHORT:
                this.filteredView = new Uint16Array(arrayLength);
                func = 'getUint16';
                break;
            case GL.UNSIGNED_INT:
                this.filteredView = new Uint32Array(arrayLength);
                func = 'getUint32';
                break;
            case GL.FLOAT:
                this.filteredView = new Float32Array(arrayLength);
                func = 'getFloat32';
                break;
            }

            for(let i = 0; i < arrayLength; ++i)
            {
                let offset = Math.floor(i/componentCount) * stride + (i % componentCount) * componentSize;
                this.filteredView[i] = dv[func](offset, true);
            }
        }

        if (this.filteredView === undefined)
        {
            console.warn("Failed to convert buffer view to filtered view!: " + this.bufferView);
        }
        else if (this.sparse !== undefined)
        {
            this.applySparse(gltf, this.filteredView);
        }

        return this.filteredView;
    }

    applySparse(gltf, view)
    {
        // Gather indices.

        const indicesBufferView = gltf.bufferViews[this.sparse.indices.bufferView];
        const indicesBuffer = gltf.buffers[indicesBufferView.buffer];
        const indicesByteOffset = this.sparse.indices.byteOffset + indicesBufferView.byteOffset;

        const indicesComponentSize = this.getComponentSize(this.sparse.indices.componentType);
        let indicesComponentCount = 1;

        if(indicesBufferView.byteStride !== 0)
        {
            indicesComponentCount = indicesBufferView.byteStride / indicesComponentSize;
        }

        const indicesArrayLength = this.sparse.count * indicesComponentCount;

        let indicesTypedView;
        switch (this.sparse.indices.componentType)
        {
        case GL.UNSIGNED_BYTE:
            indicesTypedView = new Uint8Array(indicesBuffer.buffer, indicesByteOffset, indicesArrayLength);
            break;
        case GL.UNSIGNED_SHORT:
            indicesTypedView = new Uint16Array(indicesBuffer.buffer, indicesByteOffset, indicesArrayLength);
            break;
        case GL.UNSIGNED_INT:
            indicesTypedView = new Uint32Array(indicesBuffer.buffer, indicesByteOffset, indicesArrayLength);
            break;
        }

        // Gather values.

        const valuesBufferView = gltf.bufferViews[this.sparse.values.bufferView];
        const valuesBuffer = gltf.buffers[valuesBufferView.buffer];
        const valuesByteOffset = this.sparse.values.byteOffset + valuesBufferView.byteOffset;

        const valuesComponentSize = this.getComponentSize(this.componentType);
        let valuesComponentCount = this.getComponentCount(this.type);

        if(valuesBufferView.byteStride !== 0)
        {
            valuesComponentCount = valuesBufferView.byteStride / valuesComponentSize;
        }

        const valuesArrayLength = this.sparse.count * valuesComponentCount;

        let valuesTypedView;
        switch (this.componentType)
        {
        case GL.BYTE:
            valuesTypedView = new Int8Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength);
            break;
        case GL.UNSIGNED_BYTE:
            valuesTypedView = new Uint8Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength);
            break;
        case GL.SHORT:
            valuesTypedView = new Int16Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength);
            break;
        case GL.UNSIGNED_SHORT:
            valuesTypedView = new Uint16Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength);
            break;
        case GL.UNSIGNED_INT:
            valuesTypedView = new Uint32Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength);
            break;
        case GL.FLOAT:
            valuesTypedView = new Float32Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength);
            break;
        }

        // Overwrite values.

        for(let i = 0; i < this.sparse.count; ++i)
        {
            for(let k = 0; k < valuesComponentCount; ++k)
            {
                view[indicesTypedView[i] * valuesComponentCount + k] = valuesTypedView[i * valuesComponentCount + k];
            }
        }
    }

    getComponentCount(type)
    {
        return CompononentCount.get(type);
    }

    getComponentSize(componentType)
    {
        switch (componentType)
        {
        case GL.BYTE:
        case GL.UNSIGNED_BYTE:
            return 1;
        case GL.SHORT:
        case GL.UNSIGNED_SHORT:
            return 2;
        case GL.UNSIGNED_INT:
        case GL.FLOAT:
            return 4;
        default:
            return 0;
        }
    }

    destroy()
    {
        if (this.glBuffer !== undefined)
        {
            // TODO: this breaks the dependency direction
            WebGl.context.deleteBuffer(this.glBuffer);
        }

        this.glBuffer = undefined;
    }
}

const CompononentCount = new Map(
    [
        ["SCALAR", 1],
        ["VEC2", 2],
        ["VEC3", 3],
        ["VEC4", 4],
        ["MAT2", 4],
        ["MAT3", 9],
        ["MAT4", 16]
    ]
);

export { gltfAccessor };