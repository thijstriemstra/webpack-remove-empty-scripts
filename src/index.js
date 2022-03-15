/**
 * Webpack 5 plugin to remove empty scripts generated by usage only styles in webpack entry.
 */

const path = require('path');
const ansis = require('ansis');

const plugin = 'remove-empty-scripts';
const defaultOptions = {
  enabled: true,
  verbose: false,
  extensions: ['css', 'scss', 'sass', 'less', 'styl'],
  ignore: [],
  remove: /\.(js|mjs)$/,
};

// Save unique id in dependency object as marker of 'analysed module'
// to avoid the infinite recursion by collect of resources.
let dependencyId = 1;

class WebpackRemoveEmptyScriptsPlugin {
  constructor (options) {
    this.apply = this.apply.bind(this);
    this.options = Object.assign({}, defaultOptions, options);
    this.enabled = this.options.enabled !== false;
    this.verbose = this.options.verbose;

    // if by assigned option the `ignore` was not array, then set as array
    if (!Array.isArray(this.options.ignore)) {
      this.options.ignore = [this.options.ignore];
    }

    if (Array.isArray(this.options.extensions)) {
      const pattern = this.options.extensions.map(etx => etx[0] === '.' ? etx.substring(1) : etx).join('|');
      // note: the pattern must match a resource with a query, e.g.: style.css?key=val
      this.options.extensions = new RegExp(`\.(${pattern})([?].*)?$`);
    }
  }

  apply (compiler) {
    if (!this.enabled) return;

    const { remove: removeAssets, ignore: ignoreEntryResource, extensions: styleExtensionRegexp } = this.options;

    compiler.hooks.compilation.tap(plugin, compilation => {
      const resourcesCache = [];

      compilation.hooks.chunkAsset.tap(plugin, (chunk, filename) => {
        if (!removeAssets.test(filename)) return;

        const outputPath = compiler.options.output.path;
        const chunkGraph = compilation.chunkGraph;
        let entryResources = [];

        for (const module of chunkGraph.getChunkEntryModulesIterable(chunk)) {
          if (!compilation.modules.has(module)) {
            throw new Error(
              `\n${ansis.black.bgRed(`[${plugin}]`)} entry module in chunk but not in compilation ${chunk.debugId} ${module.debugId}`
            );
          }

          const moduleResources = collectEntryResources(compilation, module, resourcesCache);
          entryResources = entryResources.concat(moduleResources);
        }

        const resources = ignoreEntryResource.length > 0
          ? entryResources.filter(res => ignoreEntryResource.every(item => !res.match(item)))
          : entryResources;

        const isEmptyScript = resources.length > 0 &&
          resources.every(resource => styleExtensionRegexp.test(resource));

        if (isEmptyScript) {
          if (this.verbose) {
            const outputFile = path.join(outputPath, filename);
            console.log(
              `${ansis.black.bgYellow(`[${plugin}]`)} remove ${ansis.cyan(outputFile)}`,
            );
          }

          chunk.files.delete(filename);
          compilation.deleteAsset(filename);
        }
      });
    });
  }
}

function collectEntryResources (compilation, module, cache) {
  const moduleGraph = compilation.moduleGraph,
    index = moduleGraph.getPreOrderIndex(module),
    propNameDependencyId = '__dependencyWebpackRemoveEmptyScriptsUniqueId',
    resources = [];

  // the index can be null
  if (index == null) return resources;

  // index of module is unique per compilation
  // module.id can be null, not used here
  if (cache[index] !== undefined) return cache[index];

  if (typeof module.resource === 'string') {
    const resources = [module.resource];
    cache[index] = resources;

    return resources;
  }

  if (module.dependencies) {
    module.dependencies.forEach(dependency => {

      let module = moduleGraph.getModule(dependency),
        originModule = moduleGraph.getParentModule(dependency),
        nextModule = module || originModule,
        useNextModule = false;

      if (!dependency.hasOwnProperty(propNameDependencyId)) {
        dependency[propNameDependencyId] = dependencyId++;
        useNextModule = true;
      }

      // debug info
      //console.log('::: module ::: ', useNextModule ? '' : '-----', dependency[propNameDependencyId]);

      if (nextModule && useNextModule) {
        const dependencyResources = collectEntryResources(compilation, nextModule, cache);

        for (let i = 0, length = dependencyResources.length; i !== length; i++) {
          const file = dependencyResources[i];
          if (resources.indexOf(file) < 0) resources.push(file);
        }
      }
    });
  }

  if (resources.length > 0) cache[index] = resources;

  return resources;
}

module.exports = WebpackRemoveEmptyScriptsPlugin;
