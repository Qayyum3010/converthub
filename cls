[1mdiff --git a/Dockerfile b/Dockerfile[m
[1mindex 78b2608..fd81194 100644[m
[1m--- a/Dockerfile[m
[1m+++ b/Dockerfile[m
[36m@@ -39,9 +39,18 @@[m [mRUN apt-get update && apt-get install -y --no-install-recommends \[m
 [m
 # Python/Ruby language-package-manager installs (separate layer from apt[m
 # for caching/debugging clarity — these aren't apt packages)[m
[31m-RUN pip3 install --no-cache-dir --break-system-packages nbconvert \[m
[32m+[m[32mRUN pip3 install --no-cache-dir --break-system-packages nbconvert weasyprint \[m
     && gem install asciidoctor --no-document[m
 [m
[32m+[m[32m# Weasyprint/fontconfig builds a system font cache on its first invocation,[m
[32m+[m[32m# which can consume most or all of a job's timeout budget in a fresh[m
[32m+[m[32m# container (observed: ~8s+ just to fail on a trivial file-not-found error).[m
[32m+[m[32m# Warm the cache here at build time so runtime jobs never pay this cost.[m
[32m+[m[32m# See DECISIONS.md.[m
[32m+[m[32mRUN echo '<html><body>warm</body></html>' > /tmp/warm.html && \[m
[32m+[m[32m    weasyprint /tmp/warm.html /tmp/warm.pdf && \[m
[32m+[m[32m    rm /tmp/warm.html /tmp/warm.pdf[m
[32m+[m
 WORKDIR /app[m
 [m
 # Copy and install server dependencies first (better layer caching —[m
