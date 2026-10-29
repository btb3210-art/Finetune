package kr.woong.practicecoach;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;

/** Runs the practice coach page from the app's own files, offline, with microphone access. */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_MIC = 1, REQ_FILE = 2;
    private WebView web;
    private PermissionRequest pendingMic;
    private ValueCallback<Uri[]> pendingFiles;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // screen stays on while practising
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mime(path), "utf-8", in);
                } catch (Exception e) { return null; }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;   // other sites (악보 인식기 등) open in the browser
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() { public void run() {
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        req.grant(req.getResources());
                    } else {
                        pendingMic = req;
                        requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC);
                    }
                }});
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "악보 파일 고르기"), REQ_FILE); }
                catch (Exception e) { pendingFiles = null; return false; }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mime(String p) {
        String l = p.toLowerCase();
        if (l.endsWith(".html")) return "text/html";
        if (l.endsWith(".js")) return "text/javascript";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".json") || l.endsWith(".webmanifest")) return "application/json";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_MIC && pendingMic != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingMic.grant(pendingMic.getResources());
            else pendingMic.deny();
            pendingMic = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE && pendingFiles != null) {
            Uri[] out = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount(); out = new Uri[n];
                    for (int k = 0; k < n; k++) out[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) out = new Uri[]{ data.getData() };
            }
            pendingFiles.onReceiveValue(out);
            pendingFiles = null;
        }
        super.onActivityResult(code, result, data);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
}
