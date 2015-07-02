/// <reference path="../typings/angularjs/angular.d.ts"/>
/// <reference path="./jsonforms.ts"/>
var RenderService = (function () {
    function RenderService() {
        //renderers = { [id: string]: IRenderer } = {};
        this.renderers = {};
    }
    RenderService.prototype.$get = function () {
        var _this = this;
        return {
            render: function (element, schema, instance, path, dataProvider) {
                var renderer = _this.renderers[element.id];
                return renderer.render(element, schema, instance, path, dataProvider);
            },
            hasRendererFor: function (element) {
                return _this.renderers.hasOwnProperty(element.id);
            },
            renderAll: function (schema, uiSchema, instance, dataProvider) {
                var result = [];
                if (uiSchema.elements === undefined) {
                    return result;
                }
                var uiElements = uiSchema.elements;
                var basePath = "#/elements/";
                for (var i = 0; i < uiElements.length; i++) {
                    var uiElement = uiElements[i];
                    var path = basePath + i;
                    if (_this.$get().hasRendererFor(uiElement)) {
                        var renderedElement = _this.$get().render(uiElement, schema, instance, path, dataProvider);
                        result.push(renderedElement);
                    }
                }
                return result;
            },
            register: function (renderer) {
                _this.renderers[renderer.id] = renderer;
            }
        };
    };
    return RenderService;
})();
angular.module('jsonForms.services', []).factory('ReferenceResolver', function () {
    var referenceMap = {};
    var keywords = ["items", "properties", "#"];
    function toPropertyFragments(path) {
        return path.split('/').filter(function (fragment) {
            return fragment.length > 0;
        });
    }
    function filterNonKeywords(fragments) {
        return fragments.filter(function (fragment) {
            return !(keywords.indexOf(fragment) !== -1);
        });
    }
    return {
        addToMapping: function (addition) {
            for (var ref in addition) {
                if (addition.hasOwnProperty(ref)) {
                    referenceMap[ref] = addition[ref];
                }
            }
        },
        get: function (uiSchemaPath) {
            return referenceMap[uiSchemaPath + "/scope/$ref"];
        },
        normalize: function (path) {
            // TODO: provide filterKeywords function
            return filterNonKeywords(toPropertyFragments(path)).join("/");
        },
        /**
         * Takes an JSON object and a schema path and resolve the schema path against the instance.
         * @param instance a JSON object
         * @param path a valid JSON path expression
         * @returns the dereferenced value
         */
        resolve: function (instance, path) {
            var p = path + "/scope/$ref";
            if (referenceMap !== undefined && referenceMap.hasOwnProperty(p)) {
                p = referenceMap[p];
            }
            return this.resolveModelPath(instance, p);
        },
        resolveModelPath: function (instance, path) {
            var fragments = toPropertyFragments(this.normalize(path));
            return fragments.reduce(function (currObj, fragment) {
                if (currObj instanceof Array) {
                    return currObj.map(function (item) {
                        return item[fragment];
                    });
                }
                return currObj[fragment];
            }, instance);
        }
    };
}).provider('RenderService', RenderService);
//# sourceMappingURL=services.js.map