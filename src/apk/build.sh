#!/bin/bash
set -e
export JAVA_TOOL_OPTIONS=
AJ=/usr/lib/android-sdk/platforms/android-23/android.jar
cd "$(dirname "$0")"
rm -rf gen obj build && mkdir -p gen obj build
cp "$(dirname "$0")/../app/dist/practice-coach.html" assets/www/index.html
aapt package -f -m -J gen -M AndroidManifest.xml -S res -I $AJ
javac --release 8 -nowarn -Xlint:-options -classpath $AJ -d obj $(find src gen -name '*.java')
dalvik-exchange --dex --output=build/classes.dex obj
aapt package -f -M AndroidManifest.xml -S res -A assets -I $AJ -F build/unaligned.apk
(cd build && aapt add unaligned.apk classes.dex >/dev/null)
zipalign -f 4 build/unaligned.apk build/aligned.apk
[ -f release.jks ] || keytool -genkeypair -keystore release.jks -alias coach -keyalg RSA -keysize 2048 -validity 10000 -storepass practicecoach -keypass practicecoach -dname "CN=Practice Coach, O=Woong, C=KR" >/dev/null 2>&1
apksigner sign --ks release.jks --ks-pass pass:practicecoach --key-pass pass:practicecoach --out build/practice-coach.apk build/aligned.apk
apksigner verify --verbose build/practice-coach.apk | head -4
aapt dump badging build/practice-coach.apk | head -3
ls -la build/practice-coach.apk
