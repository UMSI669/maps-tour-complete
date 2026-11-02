const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
/* Finished */
const root = path.resolve(__dirname, '..');
const reportOnly = process.argv.includes('--report-only');
const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const ast = parser.parse(source, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'],
});

function callNames() {
  const names = new Set();
  traverse(ast, {
    CallExpression(pathRef) {
      const callee = pathRef.node.callee;
      if (callee.type === 'Identifier') names.add(callee.name);
      if (['MemberExpression', 'OptionalMemberExpression'].includes(callee.type) && !callee.computed) names.add(callee.property.name);
    },
    OptionalCallExpression(pathRef) {
      const callee = pathRef.node.callee;
      if (callee.type === 'Identifier') names.add(callee.name);
      if (['MemberExpression', 'OptionalMemberExpression'].includes(callee.type) && !callee.computed) names.add(callee.property.name);
    },
  });
  return names;
}

function memberExists(object, property) {
  let found = false;
  traverse(ast, {
    MemberExpression(pathRef) {
      const node = pathRef.node;
      if (node.object.type === 'Identifier' && node.object.name === object
        && node.property.type === 'Identifier' && node.property.name === property) found = true;
    },
  });
  return found;
}

function switchEnabled(name) {
  let enabled = false;
  traverse(ast, {
    VariableDeclarator(pathRef) {
      if (pathRef.node.id.type !== 'Identifier' || pathRef.node.id.name !== 'LESSONS') return;
      const object = pathRef.node.init;
      if (object?.type !== 'ObjectExpression') return;
      for (const property of object.properties) {
        if (property.type === 'ObjectProperty' && property.key.type === 'Identifier'
          && property.key.name === name && property.value.type === 'BooleanLiteral') {
          enabled = property.value.value;
        }
      }
    },
  });
  return enabled;
}

function hasJsx(name) {
  let found = false;
  traverse(ast, {
    JSXOpeningElement(pathRef) {
      if (pathRef.node.name.type === 'JSXIdentifier' && pathRef.node.name.name === name) found = true;
    },
  });
  return found;
}

function hasJsxAttribute(elementName, attributeName, expectedValue) {
  let found = false;
  traverse(ast, {
    JSXOpeningElement(pathRef) {
      const node = pathRef.node;
      if (node.name.type !== 'JSXIdentifier' || node.name.name !== elementName) return;
      if (node.attributes.some(attribute => {
        if (attribute.type !== 'JSXAttribute' || attribute.name.name !== attributeName) return false;
        if (expectedValue === undefined) return true;
        const value = attribute.value;
        return value?.type === 'StringLiteral' && value.value === expectedValue;
      })) found = true;
    },
  });
  return found;
}

function hasMapTapCoordinate() {
  let found = false;
  traverse(ast, {
    MemberExpression(pathRef) {
      const node = pathRef.node;
      if (node.property.type !== 'Identifier' || node.property.name !== 'coordinate') return;
      const parent = node.object;
      if (parent.type !== 'MemberExpression' || parent.property.type !== 'Identifier'
        || parent.property.name !== 'nativeEvent') return;
      found = parent.object.type === 'Identifier' && parent.object.name === 'event';
    },
  });
  return found;
}

const calls = callNames();
const lessonChecks = [
  { key: 'map', title: 'PART 1 — SHOW A MAP', complete: hasJsx('MapView') && hasJsxAttribute('MapView', 'initialRegion') },
  { key: 'markers', title: 'PART 2 — RENDER PLACES', complete: hasJsx('Marker') && calls.has('map') && memberExists('LESSONS', 'markers') },
  { key: 'selection', title: 'PART 3 — SELECT A PLACE', complete: calls.has('setSelectedPlaceId') && hasJsxAttribute('View', 'testID', 'selected-place-card') },
  { key: 'mapTap', title: 'PART 4 — RESPOND TO MAP TAPS', complete: hasMapTapCoordinate() && calls.has('setMapPin') },
  { key: 'overlays', title: 'PART 5 — DRAW MAP OVERLAYS', complete: hasJsx('Polyline') && hasJsx('Polygon') },
  { key: 'camera', title: 'PART 6 — CONTROL THE CAMERA', complete: calls.has('fitToCoordinates') && calls.has('animateToRegion') },
  { key: 'location', title: 'PART 7 — SHOW DEVICE LOCATION', complete: calls.has('getCurrentCoordinates') && hasJsxAttribute('MapView', 'showsUserLocation') },
  { key: 'search', title: 'PART 8 — SEARCH AND FOCUS PLACES', complete: hasJsxAttribute('TextInput', 'accessibilityLabel', 'Search places') && calls.has('includes') && calls.has('toLowerCase') },
];

try {
  console.log('Maps Tour Progress\n');
  let completeCount = 0;
  for (const lesson of lessonChecks) {
    const complete = switchEnabled(lesson.key) && lesson.complete;
    if (complete) completeCount += 1;
    console.log(`${complete ? '✓' : '✗'} ${lesson.title}`);
    if (!complete) console.log(`  Next: In App.tsx, change LESSONS.${lesson.key} from false to true.`);
  }
  console.log(`\n${completeCount} of ${lessonChecks.length} parts complete`);
  if (reportOnly && completeCount !== lessonChecks.length) {
    console.log('Report-only mode: incomplete lesson steps do not fail this command.');
  } else if (completeCount !== lessonChecks.length) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Progress checker could not parse the active App.tsx source.');
  console.error(error.stack || error.message);
  process.exitCode = 2;
}
