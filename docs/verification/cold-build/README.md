# Cold source build verification

Actual 2026-09-12 cold-start compilation, including recorded network recovery. Read [summary.json](summary.json) for the exact scope and [../../reproducibility.md](../../reproducibility.md) for portable commands.

- [Inputs and tool identities](inputs-and-tools.json): original source archive, named working-source additions, current public Pink inputs, fresh official Gradle checksum and initial empty relay state.
- [Commands](commands.json): real invocation records with machine paths replaced by declared placeholders; failed attempts remain visible.
- [Source selection](engine-source-check.json), [download identities](dependency-downloads.json), [actual export classpath](export-classpath.json), [compiled output tree](compiled-output-tree.json): source and dependency evidence, not a formal offline dependency lock or redistributed code.
- [Output identities and warnings](exported-artifacts.json), [Minimal native Core](native-minimal.json), [Pink native Core](native-pink.json), [Minimal actual WebGL](web-minimal.json).

Minimal: 16 source layers, 19 parameters, 18 drawables, 192 native poses and 22 Web checks. Pink: all eight image dependencies copied from its public example, 24 source layers, 202 native poses, newly exported MOC byte-identical to the public HD MOC. No Pink upscale or 91-frame Web matrix was rerun for this cold-build check.

Only JSON/Markdown records are included here. No SDK, model weights, Gradle distribution, JAR, class files or generated model/PSD bytes are included. The existing model release and its artistic review retain their own verification scope.
