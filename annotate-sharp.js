module.exports = function(RED) {
    "use strict";
    const sharp = require("sharp");
   
    function AnnotateSharpNode(config) {
        RED.nodes.createNode(this, config);
        this.data       = config.data || "";
        this.dataType   = config.dataType || "msg";
        var node = this;
        const defaultFill = config.fill || "";
        const defaultStroke = config.stroke || "#ffC000";
        const defaultLineWidth = parseInt(config.lineWidth) || 5;
        const defaultFontSize = config.fontSize || 24;
        const defaultFontColor = config.fontColor || "#ffC000";
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
                            msg.annotations.forEach(function(annotation) {
                                let x, y, r, w, h;

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
                                        image = image.composite([{
                                            input: Buffer.from(
                                                `<svg>
                                                    <rect x="${x}" y="${y}" width="${w}" height="${h}" 
                                                    fill="${annotation.fill || defaultFill}" 
                                                    stroke="${annotation.stroke || defaultStroke}" 
                                                    stroke-width="${annotation.lineWidth || defaultLineWidth}" />
                                                </svg>`
                                            ),
                                            top: 0,
                                            left: 0
                                        }]);
                                        break;
                                    case 'circle':
                                        x = annotation.x;
                                        y = annotation.y;
                                        r = annotation.r;
                                        image = image.composite([{
                                            input: Buffer.from(
                                                `<svg>
                                                    <circle cx="${x}" cy="${y}" r="${r}" 
                                                    fill="${annotation.fill || defaultFill}" 
                                                    stroke="${annotation.stroke || defaultStroke}" 
                                                    stroke-width="${annotation.lineWidth || defaultLineWidth}" />
                                                </svg>`
                                            ),
                                            top: 0,
                                            left: 0
                                        }]);
                                        break;
                                }
                            });
                            return image.toBuffer();
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
