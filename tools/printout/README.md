# Verdant Printout (Typst)

The authoritative print template bundled with new Verdant exports is under
[`public/print/`](../../public/print/). It is **not** necessary to copy
these files when using a backup ZIP created with this version of Verdant.

To generate a garden printout from an exported ZIP:

1. Extract the entire ZIP, retaining `data.json`, `images/`, and `*.typ` together.
2. Run `typst compile printout.typ garden-printout.pdf` in that directory.

To test the included *synthetic* demo without exporting a garden, copy the
`*.typ` files from `public/print/` to `tools/printout/demo/`, then run the same
command from the `demo` directory. The demo does not contain real garden data.

The exported ZIP remains a restorable Verdant schema-2 backup. The print
source files are extra files, not a data format change. Typst CLI is installed
separately and no preprocessing step is required.
