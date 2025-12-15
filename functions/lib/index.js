"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteImageHttp = exports.uploadImageHttp = exports.deleteImageCallable = exports.uploadImageCallable = void 0;
// index.ts
var callables_1 = require("./callables");
Object.defineProperty(exports, "uploadImageCallable", { enumerable: true, get: function () { return callables_1.uploadImageCallable; } });
Object.defineProperty(exports, "deleteImageCallable", { enumerable: true, get: function () { return callables_1.deleteImageCallable; } });
var httpWrappers_1 = require("./httpWrappers");
Object.defineProperty(exports, "uploadImageHttp", { enumerable: true, get: function () { return httpWrappers_1.uploadImageHttp; } });
Object.defineProperty(exports, "deleteImageHttp", { enumerable: true, get: function () { return httpWrappers_1.deleteImageHttp; } });
//# sourceMappingURL=index.js.map