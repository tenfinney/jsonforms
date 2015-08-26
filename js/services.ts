/// <reference path="../typings/angularjs/angular.d.ts"/>
/// <reference path="../typings/schemas/uischema.d.ts"/>
/// <reference path="../typings/schemas/jsonschema.d.ts"/>

module JSONForms {

    export class UISchemaElement {

        type: string;
        elements: UISchemaElement[];

        constructor(private json: any) {
          this.type = json['type'];
          this.elements = json['elements'];
        }
    }

    export interface IDataProvider {
        data: any
        fetchData(): ng.IPromise<any>
        fetchPage(page: number, size: number): ng.IPromise<any>
        setPageSize(size: number)
        pageSize: number
        page: number
        totalItems?: number
    }

    export class DefaultDataProvider implements  IDataProvider {

        private currentPage = 0;
        private currentPageSize = 2;

        constructor(private $q: ng.IQService, public data: any) {}

        fetchData(): ng.IPromise<any> {
            var p = this.$q.defer();
            p.resolve(this.data);
            return p.promise;
        }

        setPageSize = (newPageSize: number) => {
            this.currentPageSize = newPageSize
        };

        fetchPage = (page: number, size: number) => {
            this.currentPage = page;
            this.currentPageSize = size;
            var p = this.$q.defer();
            if (this.data instanceof Array) {
                p.resolve(
                    this.data.slice(this.currentPage * this.currentPageSize, this.currentPage * this.currentPageSize + this.currentPageSize));
            } else {
                p.resolve(this.data);
            }
            return p.promise;
        };

        totalItems = this.data.length;
        pageSize = this.currentPageSize
        page = this.currentPage
    }


    export interface IRenderService {
        registerSchema(schema: SchemaElement): void
        schema: SchemaElement
        register(renderer: IRenderer): void
        render(element:JSONForms.UISchemaElement, dataProvider: JSONForms.IDataProvider);
    }

    export interface IRenderer {
        render(element: IUISchemaElement, subSchema: SchemaElement, schemaPath: string, dataProvider: JSONForms.IDataProvider): IRenderDescription
        isApplicable(uiElement: IUISchemaElement, subSchema: SchemaElement, schemaPath: string): boolean
        priority: number
    }

    export interface IRenderDescription {
        type: string
        template?: string
        templateUrl?: string
        size: number
    }

    export interface IControlRenderDescription extends IRenderDescription {
        instance: any
        path: string

        // Validation related
        subSchema: SchemaElement
        alerts: any[]
        validate(): boolean
    }

    export class ControlRenderDescription implements IControlRenderDescription {

        type = "Control";
        size = 99;
        alerts: any[] = []; // TODO IAlert type missing
        public label: string;
        public path: string;

        constructor(public instance: any, public subSchema: SchemaElement, schemaPath: string) {
            this.path = PathUtil.normalize(schemaPath);
            this.label = PathUtil.beautifiedLastFragment(schemaPath);
        }

        validate(): boolean {
            var value = this.instance[this.path];
            var result = tv4.validateMultiple(value, this.subSchema);
            if (!result.valid){
                this.alerts = [];
                var alert = {
                    type: 'danger',
                    msg: result.errors[0].message
                };
                this.alerts.push(alert);
            } else {
                this.alerts = [];
            }

            return result.valid;
        }

    }

    export interface IContainerRenderDescription extends IRenderDescription {
        elements: IRenderDescription[]
    }

    export interface IReferenceResolver {
        addUiPathToSchemaRefMapping(addition:any): void

        getSchemaRef(uiSchemaPath:string): any

        normalize(path:string): string

        resolveUi(instance:any, uiPath:string): any

        resolveInstance(instance:any, path:string): any

        resolveSchema(schema: SchemaElement, schemaPath: string): SchemaElement
    }

    export interface IUISchemaGenerator {
        generateDefaultUISchema(jsonSchema:any): any
    }

    // TODO: EXPORT
    export class RenderService implements  IRenderService {

        private renderers: IRenderer[] = [];
        public schema: SchemaElement;
        static $inject = ['ReferenceResolver'];

        constructor(private refResolver: IReferenceResolver) {
        }

        registerSchema = (schema: SchemaElement) => {
            this.schema = schema
        };

        render = (element: IUISchemaElement, dataProvider: JSONForms.IDataProvider) => {

            var foundRenderer;
            var schemaPath;
            var subSchema;

            // TODO element must be IControl
            if (element['scope']) {
                schemaPath = element['scope']['$ref'];
                subSchema = this.refResolver.resolveSchema(this.schema, schemaPath);
            }

            for (var i = 0; i < this.renderers.length; i++) {
                if (this.renderers[i].isApplicable(element, subSchema, schemaPath)) {
                    if (foundRenderer == undefined || this.renderers[i].priority > foundRenderer.priority) {
                        foundRenderer = this.renderers[i];
                    }
                }
            }

            if (foundRenderer === undefined) {
                throw new Error("No applicable renderer found for element " + JSON.stringify(element));
            }

            var resultObject = foundRenderer.render(element, subSchema, schemaPath, dataProvider);
            if (resultObject.validate) {
                resultObject.validate();
            }
            return resultObject;
        };
        register = (renderer:IRenderer) => {
            this.renderers.push(renderer);
        }
    }

    class PathUtil {

        private static Keywords:string[] = ["items", "properties", "#"];

        static normalize = (path:string):string => {
            return PathUtil.filterNonKeywords(PathUtil.toPropertyFragments(path)).join("/");
        };

        static toPropertyFragments = (path:string):string[] => {
            return path.split('/').filter(function (fragment) {
                return fragment.length > 0;
            })
        };

        static filterNonKeywords = (fragments:string[]):string[] => {
            return fragments.filter(function (fragment) {
                return !(PathUtil.Keywords.indexOf(fragment) !== -1);
            });
        };

        static beautifiedLastFragment(schemaPath: string): string  {
            return PathUtil.beautify(PathUtil.capitalizeFirstLetter(schemaPath.substr(schemaPath.lastIndexOf('/') + 1, schemaPath.length)));
        }

        private static capitalizeFirstLetter(string): string {
            return string.charAt(0).toUpperCase() + string.slice(1);
        }


        /**
         * Beautifies by performing the following steps (if applicable)
         * 1. split on uppercase letters
         * 2. transform uppercase letters to lowercase
         * 3. transform first letter uppercase
         */
        static beautify = (text: string): string => {
            if(text && text.length > 0){
                var textArray = text.split(/(?=[A-Z])/).map((x)=>{return x.toLowerCase()});
                textArray[0] = textArray[0].charAt(0).toUpperCase() + textArray[0].slice(1);
                return textArray.join(' ');
            }
            return text;
        };

    }

    export class ReferenceResolver {

        private pathMapping:{ [id: string]: string; } = {};
        static $inject = ["$compile"];
        // $compile can then be used as this.$compile
        constructor(private $compile:ng.ICompileService) {
        }

        addUiPathToSchemaRefMapping = (addition:any) => {
            for (var ref in addition) {
                if (addition.hasOwnProperty(ref)) {
                    this.pathMapping[ref] = addition[ref];
                }
            }
        };
        getSchemaRef = (uiSchemaPath:string):any => {

            if (uiSchemaPath == "#") {
                return "#";
            }

            return this.pathMapping[uiSchemaPath + "/scope/$ref"];
        };

        normalize = (path:string):string => {
            return PathUtil.normalize(path);
        };

        resolveUi = (instance:any, uiPath:string):any => {
            var p = uiPath + "/scope/$ref";
            if (this.pathMapping !== undefined && this.pathMapping.hasOwnProperty(p)) {
                p = this.pathMapping[p];
            }
            return this.resolveInstance(instance, p);
        };


        resolveInstance = (instance:any, path:string):any => {
            var fragments = PathUtil.toPropertyFragments(this.normalize(path));
            return fragments.reduce(function (currObj, fragment) {
                if (currObj instanceof Array) {
                    return currObj.map(function (item) {
                        return item[fragment];
                    });
                }
                return currObj[fragment];
            }, instance);
        };

        resolveSchema = (schema: any, path: string): any => {

            var fragments = PathUtil.toPropertyFragments(path);
            return fragments.reduce(function (subSchema, fragment) {
                if (fragment == "#"){
                    return subSchema
                } else if (subSchema instanceof Array) {
                    return subSchema.map(function (item) {
                        return item[fragment];
                    });
                }
                return subSchema[fragment];
            }, schema);
        };



    }

    export class UISchemaGenerator{
        generateDefaultUISchema = (jsonSchema:any):any =>{
            var uiSchemaElements = [];
            this.generateUISchema(jsonSchema, uiSchemaElements, "#", "");

            console.log("generated schema: " + JSON.stringify(uiSchemaElements[0]))

            return uiSchemaElements[0];
        };

        private generateUISchema = (jsonSchema:any, schemaElements:IUISchemaElement[], currentRef:string, schemaName:string):any =>{
            var type = this.deriveType(jsonSchema);

            switch(type) {

                case "object":
                    // Add a vertical layout with a label for the element name (if it exists)
                    var verticalLayout:IVerticalLayout = {
                        type: "VerticalLayout",
                        elements: []
                    };
                    schemaElements.push(verticalLayout);

                    if (schemaName && schemaName !== "") {
                        // add label with name
                        var label:ILabel = {
                            type: "Label",
                            text: PathUtil.beautify(schemaName)
                        };
                        verticalLayout.elements.push(label);
                    }

                    // traverse properties
                    if (!jsonSchema.properties) {
                        // If there are no properties return
                        return;
                    }

                    var nextRef:string = currentRef + '/' + "properties";
                    for (var property in jsonSchema.properties) {
                        if(this.isIgnoredProperty(property, jsonSchema.properties[property])){
                            continue;
                        }
                        this.generateUISchema(jsonSchema.properties[property], verticalLayout.elements, nextRef + "/" + property, property);
                    }

                    break;

                case "array":
                    var horizontalLayout:IHorizontalLayout = {
                        type: "HorizontalLayout",
                        elements: []
                    };
                    schemaElements.push(horizontalLayout);

                    var nextRef:string = currentRef + '/' + "items";

                    if (!jsonSchema.items) {
                        // If there are no items ignore the element
                        return;
                    }

                    //check if items is object or array
                    if (jsonSchema.items instanceof Array) {
                        for (var i = 0; i < jsonSchema.items.length; i++) {
                            this.generateUISchema(jsonSchema.items[i], horizontalLayout.elements, nextRef + '[' + i + ']', "");
                        }
                    } else {
                        this.generateUISchema(jsonSchema.items, horizontalLayout.elements, nextRef, "");
                    }

                    break;

                case "string":
                case "number":
                case "integer":
                case "boolean":
                    var controlObject:IControlObject = this.getControlObject(PathUtil.beautify(schemaName), currentRef);
                    schemaElements.push(controlObject);
                    break;
                case "null":
                    //ignore
                    break;
                default:
                    throw new Error("Unknown type: " + JSON.stringify(jsonSchema));
            }

        };

        /**
         * Determines if the property should be ignored because it is a meta property
         */
        private isIgnoredProperty = (propertyKey: string, propertyValue: any): boolean => {
            // could be a string (json-schema-id). Ignore in that case
            return propertyKey === "id" && typeof propertyValue === "string";
            // TODO ignore all meta keywords
        }

        /**
         * Derives the type of the jsonSchema element
         */
        private deriveType = (jsonSchema: any): string => {
            if(jsonSchema.type){
                return jsonSchema.type;
            }
            if(jsonSchema.properties || jsonSchema.additionalProperties){
                return "object";
            }
            // ignore all remaining cases
            return "null";
        }

        /**
         * Creates a IControlObject with the given label referencing the given ref
         */
        private getControlObject = (label: string, ref: string): IControlObject =>{
            return {
                type: "Control",
                label: label,
                scope: {
                    $ref: ref
                }
            };
        };
    }


    export class RecursionHelper {

        static $inject = ["$compile"];
        // $compile can then be used as this.$compile
        constructor(private $compile:ng.ICompileService) {
        }

        compile = (element, link) => {

            // Normalize the link parameter
            if (angular.isFunction(link)) {
                link = {post: link};
            }

            // Break the recursion loop by removing the contents
            var contents = element.contents().remove();
            var compiledContents;
            var that = this;
            return {
                pre: (link && link.pre) ? link.pre : null,
                /**
                 * Compiles and re-adds the contents
                 */
                post: function (scope, element) {

                    // Compile the contents
                    if (!compiledContents) {
                        compiledContents = that.$compile(contents);
                    }
                    // Re-add the compiled contents to the element
                    compiledContents(scope, function (clone) {
                        element.append(clone);
                    });

                    // Call the post-linking function, if any
                    if (link && link.post) {
                        link.post.apply(null, arguments);
                    }
                }
            };
        }
    }

    export class RenderDescriptionFactory {
        createControlDescription(data: any, subSchema: SchemaElement, schemaPath: string) {
            return new ControlRenderDescription(data, subSchema, schemaPath);
        }
    }

    declare var tv4;
    export class ValidationService {
        validate = (data: any, schema: SchemaElement) => {
            return tv4.validateMultiple(data, schema);
        }
    }
}

angular.module('jsonForms.services', [])
    .service('RecursionHelper', JSONForms.RecursionHelper)
    .service('ReferenceResolver', JSONForms.ReferenceResolver)
    .service('JSONForms.RenderService', JSONForms.RenderService)
    .service('UISchemaGenerator', JSONForms.UISchemaGenerator)
    .service('ValidationService', JSONForms.ValidationService)
    .service('JSONForms.RenderDescriptionFactory', JSONForms.RenderDescriptionFactory);