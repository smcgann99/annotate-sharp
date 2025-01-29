module.exports = function(RED) {
    "use strict";
    const sharp = require("sharp");
    const path = require("path");

    function calculateLineWidth(height) {
        const referenceHeight = 700;
        const referenceWidth = 14;
        let width = Math.round((height / referenceHeight) * referenceWidth);
        return Math.max(width, 1);
    }

    function AnnotateSharpNode(config) {
        RED.nodes.createNode(this, config);
        this.data       = config.data || "";
        this.dataType   = config.dataType || "msg";
        var node = this;
        const defaultStroke = config.stroke || "#ffC000";
        const defaultFontSize =  20;
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

                            const annotationPromises = msg.annotations.map(async function(annotation) {
                                let x, y, r, w, h, textX, textY, fontSize;
                                annotation.fontSize = annotation.fontSize || config.fontSize;
                                annotation.lineWidth = annotation.lineWidth || config.lineWidth;

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
                                                            stroke-width="${annotation.lineWidth || calculateLineWidth(h)}" />`;
                                        if (annotation.label) {
                                            fontSize = annotation.fontSize || await calculateFontSize(annotation.label, w, defaultFontSize);
                                            node.warn(fontSize);
                                            textY = (y - 5 < 0 || y - 5 < metadata.height - (y + h + 5 + fontSize)) ? y + h + 5 + fontSize : y - 5;
                                            svgAnnotations += `<text x="${x}" y="${textY}" font-size="${fontSize}" 
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
                                                            stroke-width="${annotation.lineWidth || calculateLineWidth(r*2)}" />`;
                                        if (annotation.label) {
                                            fontSize = annotation.fontSize || await calculateFontSize(annotation.label, 2 * r, defaultFontSize);
                                            textX = x - r;
                                            textY = (y - r - 5 < 0 || y - r - 5 < metadata.height - (y + r + 5 + fontSize)) ? y + r + 5 + fontSize : y - r - 5;
                                            svgAnnotations += `<text x="${textX}" y="${textY}" font-size="${fontSize}" 
                                                                fill="${annotation.fontColor || defaultFontColor}" font-family="SourceSansPro">${annotation.label}</text>`;
                                        }
                                        break;
                                }
                            });

                            return Promise.all(annotationPromises).then(() => {
                                svgAnnotations += '</svg>';
                                return image.composite([{ input: Buffer.from(svgAnnotations), top: 0, left: 0 }]).toBuffer();
                            });
                        })
                        .then(outputBuffer => {
                            msg.payload = outputBuffer;
                            node.send(msg);
                        })
                        .catch(err => {
                            handleError(err, msg, "Image processing error");
                        });
                } else {
                    handleError(new Error("No annotations provided"), msg, "No annotations", input);
                }
            } else {
                handleError(new Error("Input is not a buffer"), msg, "Invalid input");
            }
        });

        async function calculateFontSize(text, maxWidth, defaultFontSize) {
            const svgText = `<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="0" font-family="SourceSansPro" font-size="${defaultFontSize}">${text}</text></svg>`;
            const metadata = await sharp(Buffer.from(svgText)).metadata();
            const textWidth = metadata.width;
            const scaleFactor = maxWidth / textWidth;
            return Math.ceil(Math.max(defaultFontSize * scaleFactor, defaultFontSize));
        }

        function handleError(err, msg, errorText, originalPayload = null) {
            node.error(errorText, msg);
            msg.error = err;
            if (originalPayload) {
                msg.payload = originalPayload;
            }
            node.send(msg); // Send the message to the single output
        }
    }

    RED.nodes.registerType("annotate-sharp", AnnotateSharpNode);
};
