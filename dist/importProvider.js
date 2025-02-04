'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConvertGLBtoGltfLoadFirst = exports.ConvertGLBtoGltf = void 0;
const fs = require("fs");
const path = require("path");
const exportProvider_1 = require("./exportProvider");
function readSourceFile(sourceFilename) {
    if (typeof sourceFilename == 'undefined') {
        throw new Error('Input file undefined.');
    }
    if (!fs.existsSync(sourceFilename)) {
        throw new Error('File not found.');
    }
    // Read the GLB data
    const Binary = {
        Magic: 0x46546C67
    };
    const sourceBuf = fs.readFileSync(sourceFilename);
    const readMagic = sourceBuf.readUInt32LE(0);
    if (readMagic !== Binary.Magic) {
        throw new Error('Source file does not appear to be a GLB (glTF Binary) model.');
    }
    const readVersion = sourceBuf.readUInt32LE(4);
    if (readVersion !== 2) {
        throw new Error('Only GLB version 2 is supported for import. Detected version: ' + readVersion);
    }
    return sourceBuf;
}
/**
 * Convert GLB -> glTF; overwrites any existing files.
 *
 * @param sourceFilename input glb filename
 * @param targetFilename output glTF filename
 */
function ConvertGLBtoGltf(sourceFilename, targetFilename) {
    const sourceBuf = readSourceFile(sourceFilename);
    doConversion(sourceBuf, path.dirname(sourceFilename), targetFilename);
}
exports.ConvertGLBtoGltf = ConvertGLBtoGltf;
/**
 * This form of GLB -> glTF convert function will open and validate the input filename
 * before calling the parameter function to get a filename for output. This is allows
 * a UI to query a customer for a filename when its expected that the conversion will
 * succeed.
 *
 * @param sourceFilename input glb filename
 * @param getTargetFilename async function that will return the output gltf filename
 * @returns the output filename
 */
function ConvertGLBtoGltfLoadFirst(sourceFilename, getTargetFilename) {
    return __awaiter(this, void 0, void 0, function* () {
        const sourceBuf = readSourceFile(sourceFilename);
        const targetFilename = yield getTargetFilename();
        if (targetFilename != null) {
            doConversion(sourceBuf, path.dirname(sourceFilename), targetFilename);
        }
        return targetFilename;
    });
}
exports.ConvertGLBtoGltfLoadFirst = ConvertGLBtoGltfLoadFirst;
function doConversion(sourceBuf, pathBase, targetFilename) {
    // Strip off the '.glb' or other file extension, for use as a base name for external assets.
    let targetBasename = targetFilename;
    if (path.extname(targetFilename).length > 1) {
        const components = targetFilename.split('.');
        components.pop();
        targetBasename = components.join('.');
    }
    const jsonBufSize = sourceBuf.readUInt32LE(12);
    const jsonString = sourceBuf.toString('utf8', 20, jsonBufSize + 20);
    const gltf = JSON.parse(jsonString);
    const binBuffer = sourceBuf.slice(jsonBufSize + 28);
    // returns any image objects for the given bufferView index if the buffer view is an image
    function findImagesForBufferView(bufferViewIndex) {
        if (gltf.images !== undefined && gltf.images instanceof Array) {
            return gltf.images.filter((i) => i.bufferView === bufferViewIndex);
        }
        return [];
    }
    // writes to the filesystem image data from the parameters
    function writeImageBuf(images, bufferViewIndex, binBuffer) {
        const view = gltf.bufferViews[bufferViewIndex];
        const offset = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length = view.byteLength;
        const firstReference = images[0];
        const extension = (0, exportProvider_1.guessFileExtension)(firstReference.mimeType);
        const imageIndex = gltf.images.indexOf(firstReference);
        const filename = targetBasename + '_img' + imageIndex.toString() + extension;
        const buf = (0, exportProvider_1.getBuffer)(gltf, view.buffer, pathBase, binBuffer);
        if (buf === null) {
            throw new Error('Content of bufferId ' + view.bufferId + ' not found.');
        }
        fs.writeFileSync(filename, buf.slice(offset, offset + length), 'binary');
        images.forEach(image => {
            delete image.bufferView;
            delete image.mimeType;
            image.uri = path.basename(filename);
        });
    }
    // returns any shaders for the given bufferView index if the buffer view is a shader
    function findShadersForBufferView(bufferViewIndex) {
        if (gltf.shaders && gltf.shaders instanceof Array) {
            return gltf.shaders.filter((s) => s.bufferView === bufferViewIndex);
        }
        return [];
    }
    // writes to the filesystem shader data from the parameters
    function writeShaderBuf(shaders, bufferViewIndex, binBuffer) {
        const view = gltf.bufferViews[bufferViewIndex];
        const offset = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length = view.byteLength;
        let extension = '.glsl';
        const GL_VERTEX_SHADER_ARB = 0x8B31;
        const GL_FRAGMENT_SHADER_ARB = 0x8B30;
        const firstReference = shaders[0];
        if (firstReference.type == GL_VERTEX_SHADER_ARB) {
            extension = '.vert';
        }
        else if (firstReference.type == GL_FRAGMENT_SHADER_ARB) {
            extension = '.frag';
        }
        const shaderIndex = gltf.shaders.indexOf(firstReference);
        const filename = targetBasename + '_shader' + shaderIndex.toString() + extension;
        const buf = (0, exportProvider_1.getBuffer)(gltf, view.buffer, pathBase, binBuffer);
        if (buf === null) {
            throw new Error('Content of bufferId ' + view.bufferId + ' not found.');
        }
        fs.writeFileSync(filename, buf.slice(offset, offset + length), 'binary');
        shaders.forEach(shader => {
            delete shader.bufferView;
            delete shader.mimeType;
            shader.uri = path.basename(filename);
        });
    }
    function writeExtensionBuffer(buffers, bufferViewIndex, binBuffer) {
        const view = gltf.bufferViews[bufferViewIndex];
        const offset = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length = view.byteLength;
        const firstReference = buffers[0];
        const extension = (0, exportProvider_1.guessFileExtension)(firstReference.buffer.mimeType);
        const filename = targetBasename + '_' + firstReference.name + '_' + bufferViewIndex.toString() + extension;
        const buf = (0, exportProvider_1.getBuffer)(gltf, view.buffer, pathBase, binBuffer);
        if (buf === null) {
            throw new Error('Content of bufferId ' + view.bufferId + ' not found.');
        }
        fs.writeFileSync(filename, buf.slice(offset, offset + length), 'binary');
        buffers.forEach(buffer => {
            delete buffer.buffer.bufferView;
            delete buffer.buffer.mimeType;
            buffer.buffer.uri = path.basename(filename);
        });
    }
    function findExtensionBuffers(gltf, bufferViewIndex) {
        const buffers = [];
        if (gltf.extensions) {
            for (const extensionName in gltf.extensions) {
                const extension = gltf.extensions[extensionName];
                for (const extensionPropertyName in extension) {
                    const extensionProperty = extension[extensionPropertyName];
                    if (extensionProperty instanceof Array) {
                        const bufferName = extensionName + '_' + extensionPropertyName;
                        const curBuffers = extensionProperty.filter((b) => b.bufferView === bufferViewIndex);
                        for (const buffer in curBuffers) {
                            buffers.push({ 'buffer': curBuffers[buffer], 'name': bufferName });
                        }
                    }
                }
            }
        }
        return buffers;
    }
    // data the represents the buffers that are neither images or shaders
    const bufferViewList = [];
    const bufferDataList = [];
    function addToBinaryBuf(bufferViewIndex, binBuffer) {
        const view = gltf.bufferViews[bufferViewIndex];
        const offset = view.byteOffset === undefined ? 0 : view.byteOffset;
        const length = view.byteLength;
        const aLength = (0, exportProvider_1.alignedLength)(length);
        let bufPart;
        const buf = (0, exportProvider_1.getBuffer)(gltf, view.buffer, pathBase, binBuffer);
        if (buf === null) {
            throw new Error('Content of bufferId ' + view.bufferId + ' not found.');
        }
        if (length == aLength) {
            bufPart = buf.slice(offset, offset + length);
        }
        else {
            bufPart = Buffer.alloc(aLength, buf.slice(offset, offset + length));
        }
        bufferViewList.push(bufferViewIndex);
        bufferDataList.push(bufPart);
    }
    // go through all the buffer views and break out buffers as separate files
    if (gltf.bufferViews) {
        for (let bufferViewIndex = 0; bufferViewIndex < gltf.bufferViews.length; bufferViewIndex++) {
            const images = findImagesForBufferView(bufferViewIndex);
            if (images.length > 0) {
                writeImageBuf(images, bufferViewIndex, binBuffer);
                continue;
            }
            const shaders = findShadersForBufferView(bufferViewIndex);
            if (shaders.length > 0) {
                writeShaderBuf(shaders, bufferViewIndex, binBuffer);
                continue;
            }
            const buffers = findExtensionBuffers(gltf, bufferViewIndex);
            if (buffers.length > 0) {
                writeExtensionBuffer(buffers, bufferViewIndex, binBuffer);
                continue;
            }
            addToBinaryBuf(bufferViewIndex, binBuffer);
        }
    }
    // create a file for the rest of the buffer data
    const newBufferView = [];
    let currentOffset = 0;
    for (let i = 0; i < bufferViewList.length; i++) {
        const view = gltf.bufferViews[bufferViewList[i]];
        const length = bufferDataList[i].length;
        view.buffer = 0;
        view.byteOffset = currentOffset;
        view.byteLength = length;
        newBufferView.push(view);
        currentOffset += length;
    }
    gltf.bufferViews = newBufferView;
    function getNewBufferViewIndex(oldIndex) {
        const newIndex = bufferViewList.indexOf(oldIndex);
        if (newIndex < 0) {
            throw new Error('Problem mapping bufferView indices.');
        }
        return newIndex;
    }
    // Renumber existing bufferView references.
    // No need to check gltf.images*.bufferView since images were broken out above.
    if (gltf.accessors) {
        for (const accessor of gltf.accessors) {
            if (accessor.bufferView !== undefined) {
                accessor.bufferView = getNewBufferViewIndex(accessor.bufferView);
            }
            if (accessor.sparse) {
                if (accessor.sparse.indices && accessor.sparse.indices.bufferView !== undefined) {
                    accessor.sparse.indices.bufferView = getNewBufferViewIndex(accessor.sparse.indices.bufferView);
                }
                if (accessor.sparse.values && accessor.sparse.values.bufferView !== undefined) {
                    accessor.sparse.values.bufferView = getNewBufferViewIndex(accessor.sparse.values.bufferView);
                }
            }
        }
    }
    if (gltf.meshes) {
        for (const mesh of gltf.meshes) {
            for (const primitive of mesh.primitives) {
                if (primitive.extensions && primitive.extensions.KHR_draco_mesh_compression) {
                    primitive.extensions.KHR_draco_mesh_compression.bufferView = getNewBufferViewIndex(primitive.extensions.KHR_draco_mesh_compression.bufferView);
                }
            }
        }
    }
    const binFilename = targetBasename + '_data.bin';
    const finalBuffer = Buffer.concat(bufferDataList);
    fs.writeFileSync(binFilename, finalBuffer, 'binary');
    gltf.buffers = [{
            uri: path.basename(binFilename),
            byteLength: finalBuffer.length
        }];
    // write out the final GLTF json and open.
    const gltfString = JSON.stringify(gltf, null, '  ');
    fs.writeFileSync(targetFilename, gltfString, 'utf8');
}
//# sourceMappingURL=importProvider.js.map