module.exports = function(RED) {
    "use strict";
    const sharp = require("sharp");
    const path = require("path");

    function AnnotateSharpNode(config) {
        RED.nodes.createNode(this, config);
        this.data       = config.data || "";
        this.dataType   = config.dataType || "msg";
        var node = this;
        const defaultStroke = config.stroke || "#ffC000";
        const defaultLineWidth = parseInt(config.lineWidth) || 5;
        const defaultFontSize = config.fontSize || 24;
        const defaultFontColor = config.fontColor || "#ffC000";
        const fontPath = path.join(__dirname, "SourceSansPro-Regular.ttf");
        let input = null;

        this.on("input", function(msg) {
            RED.util.evaluateNodeProperty(node.data, node.dataType, node, msg, (err, value) => {
                if (err) {
                    handleError(err, msg, "Invalid source");
                    return;
                } else {
                    input = value;
                }
            });
            if (Buffer.isBuffer(input)) {
                if (Array.isArray(msg.annotations) && msg.annotations.length > 0) {

                    const buffer = Buffer.from(input);
                    sharp(buffer)
                        .metadata()
                        .then(metadata => {
                            let image = sharp(buffer);
                            let svgAnnotations = '<svg width="' + metadata.width + '" height="' + metadata.height + '">';
                            svgAnnotations += `<style>@font-face { font-family: 'SourceSansPro'; src: url('${fontPath}'); }</style>`;

                            msg.annotations.forEach(function(annotation) {
                                let x, y, r, w, h, textX, textY;

                                if (!annotation.type && annotation.bbox) {
                                    annotation.type = 'rect';
                                }

                                switch (annotation.type) {
                                    case 'rect':
                                        if (annotation.bbox) {
                                            x = annotation.bbox[0];
                                            y = annotation.bbox[1];
                                            w = annotation.bbox[2];
                                            h = annotation.bbox[3];
                                        } else {
                                            x = annotation.x;
                                            y = annotation.y;
                                            w = annotation.w;
                                            h = annotation.h;
                                        }
                                        if (x < 0) {
                                            w += x;
                                            x = 0;
                                        }
                                        if (y < 0) {
                                            h += y;
                                            y = 0;
                                        }
                                        svgAnnotations += `<rect x="${x}" y="${y}" width="${w}" height="${h}" 
                                                            fill="none" 
                                                            stroke="${annotation.stroke || defaultStroke}" 
                                                            stroke-width="${annotation.lineWidth || defaultLineWidth}" />`;
                                        if (annotation.label) {
                                            textY = (y - 5 < 0 || y - 5 < metadata.height - (y + h + 5 + (annotation.fontSize || defaultFontSize))) ? y + h + 5 + (annotation.fontSize || defaultFontSize) : y - 5;
                                            svgAnnotations += `<text x="${x}" y="${textY}" font-size="${annotation.fontSize || defaultFontSize}" 
                                                                fill="${annotation.fontColor || defaultFontColor}" font-family="SourceSansPro">${annotation.label}</text>`;
                                        }
                                        break;
                                    case 'circle':
                                        x = annotation.x;
                                        y = annotation.y;
                                        r = annotation.r;
                                        svgAnnotations += `<circle cx="${x}" cy="${y}" r="${r}" 
                                                            fill="none" 
                                                            stroke="${annotation.stroke || defaultStroke}" 
                                                            stroke-width="${annotation.lineWidth || defaultLineWidth}" />`;
                                        if (annotation.label) {
                                            textX = x - r;
                                            textY = (y - r - 5 < 0 || y - r - 5 < metadata.height - (y + r + 5 + (annotation.fontSize || defaultFontSize))) ? y + r + 5 + (annotation.fontSize || defaultFontSize) : y - r - 5;
                                            svgAnnotations += `<text x="${textX}" y="${textY}" font-size="${annotation.fontSize || defaultFontSize}" 
                                                                fill="${annotation.fontColor || defaultFontColor}" font-family="SourceSansPro">${annotation.label}</text>`;
                                        }
                                        break;
                                }
                            });

                            svgAnnotations += '</svg>';

                            return image.composite([{ input: Buffer.from(svgAnnotations), top: 0, left: 0 }]).toBuffer();
                        })
                        .then(outputBuffer => {
                            msg.payload = outputBuffer;
                            node.send(msg);
                        })
                        .catch(err => {
                            handleError(err, msg, "Image processing error");
                        });
                } else {
                    handleError(new Error("No annotations provided"), msg, "No annotations");
                }
            } else {
                handleError(new Error("Input is not a buffer"), msg, "Invalid input");
            }
        });

        function handleError(err, msg, errorText) {
            node.error(errorText, msg);
            msg.error = err;
            node.send([null, msg]);
        }
    }

    RED.nodes.registerType("annotate-sharp", AnnotateSharpNode);
};
