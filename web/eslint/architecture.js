import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

function sourcePath(filename) {
  return path.relative(sourceRoot, filename).split(path.sep).join("/");
}

function featureOf(filename) {
  return /^features\/([^/]+)\//u.exec(filename)?.[1];
}

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      feature: "Features and shared modules must not depend on another feature.",
      root: "Import a feature through its root interface: @/features/{{feature}}.",
      local: "Use relative imports within a feature implementation.",
      composition: "Features and shared modules must not import application composition. Use shared presentation or infrastructure instead.",
    },
  },
  create(context) {
    const importer = sourcePath(context.filename);
    const ownFeature = featureOf(importer);
    const isShared = importer.startsWith("shared/");

    function check(node) {
      if (!node) return;
      const specifier = node.type === "TemplateLiteral" && node.expressions.length === 0
        ? node.quasis[0].value.cooked
        : node.value;
      if (typeof specifier !== "string") return;
      const target = specifier.startsWith("@/")
        ? path.resolve(sourceRoot, specifier.slice(2))
        : specifier.startsWith(".")
          ? path.resolve(path.dirname(context.filename), specifier)
          : null;
      if (!target) return;

      const dependency = sourcePath(target);
      // A directory import and an explicit index import identify the same feature.
      const targetFeature = featureOf(`${dependency}/`);
      if (targetFeature) {
        if (isShared || (ownFeature && ownFeature !== targetFeature)) {
          context.report({ node, messageId: "feature" });
        } else if (ownFeature === targetFeature) {
          if (!specifier.startsWith(".")) {
            context.report({ node, messageId: "local" });
          }
        } else if (specifier !== `@/features/${targetFeature}`) {
          context.report({ node, messageId: "root", data: { feature: targetFeature } });
        }
      }

      if ((ownFeature || isShared) &&
        /^(?:components\/app(?:\/|$)|layouts(?:\/|$)|pages(?:\/|$)|(?:App|main)(?:\.[^/]+)?$)/u.test(dependency)) {
        context.report({ node, messageId: "composition" });
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      TSImportType: (node) => check(node.source),
    };
  },
};
