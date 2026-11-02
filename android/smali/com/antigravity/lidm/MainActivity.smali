.class public Lcom/antigravity/lidm/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

.field public webView:Landroid/webkit/WebView;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 6

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lcom/antigravity/lidm/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1

    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowContentAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V

    new-instance v2, Lcom/antigravity/lidm/LidmWebViewClient;
    invoke-direct {v2, p0}, Lcom/antigravity/lidm/LidmWebViewClient;-><init>(Lcom/antigravity/lidm/MainActivity;)V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v2, Lcom/antigravity/lidm/LidmWebChromeClient;
    invoke-direct {v2, p0}, Lcom/antigravity/lidm/LidmWebChromeClient;-><init>(Lcom/antigravity/lidm/MainActivity;)V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    new-instance v2, Lcom/antigravity/lidm/WebAppInterface;
    invoke-direct {v2, p0}, Lcom/antigravity/lidm/WebAppInterface;-><init>(Lcom/antigravity/lidm/MainActivity;)V
    const-string v3, "AndroidBridge"
    invoke-virtual {v0, v2, v3}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    invoke-virtual {p0, v0}, Lcom/antigravity/lidm/MainActivity;->setContentView(Landroid/view/View;)V

    const-string v1, "file:///android_asset/index.html"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    invoke-virtual {p0}, Lcom/antigravity/lidm/MainActivity;->getIntent()Landroid/content/Intent;
    move-result-object v0
    invoke-direct {p0, v0}, Lcom/antigravity/lidm/MainActivity;->handleIntent(Landroid/content/Intent;)V

    return-void
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .registers 2
    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V
    invoke-virtual {p0, p1}, Lcom/antigravity/lidm/MainActivity;->setIntent(Landroid/content/Intent;)V
    invoke-direct {p0, p1}, Lcom/antigravity/lidm/MainActivity;->handleIntent(Landroid/content/Intent;)V
    return-void
.end method

.method private handleIntent(Landroid/content/Intent;)V
    .registers 6

    if-nez p1, :cond_0
    return-void

    :cond_0
    invoke-virtual {p1}, Landroid/content/Intent;->getAction()Ljava/lang/String;
    move-result-object v0
    if-nez v0, :cond_1
    return-void

    :cond_1
    const-string v1, "android.intent.action.SEND"
    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v1

    if-eqz v1, :cond_2
    const-string v0, "android.intent.extra.TEXT"
    invoke-virtual {p1, v0}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    if-eqz v0, :cond_3
    invoke-direct {p0, v0}, Lcom/antigravity/lidm/MainActivity;->deliverUrlToWeb(Ljava/lang/String;)V
    goto :goto_0

    :cond_2
    const-string v1, "android.intent.action.VIEW"
    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v0
    if-eqz v0, :cond_3
    invoke-virtual {p1}, Landroid/content/Intent;->getDataString()Ljava/lang/String;
    move-result-object v0
    if-eqz v0, :cond_3
    invoke-direct {p0, v0}, Lcom/antigravity/lidm/MainActivity;->deliverUrlToWeb(Ljava/lang/String;)V

    :cond_3
    :goto_0
    return-void
.end method

.method private deliverUrlToWeb(Ljava/lang/String;)V
    .registers 5

    iget-object v0, p0, Lcom/antigravity/lidm/MainActivity;->webView:Landroid/webkit/WebView;
    if-nez v0, :cond_0
    return-void

    :cond_0
    new-instance v0, Ljava/lang/StringBuilder;
    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V
    const-string v1, "javascript:setTimeout(function(){ if (window.onReceiveSharedUrl) window.onReceiveSharedUrl('"
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v1, "'); }, 600);"
    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v0

    iget-object v1, p0, Lcom/antigravity/lidm/MainActivity;->webView:Landroid/webkit/WebView;
    const/4 v2, 0x0
    invoke-virtual {v1, v0, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    return-void
.end method

.method public onBackPressed()V
    .registers 2

    iget-object v0, p0, Lcom/antigravity/lidm/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :cond_0
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v0
    if-eqz v0, :cond_0
    iget-object v0, p0, Lcom/antigravity/lidm/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void

    :cond_0
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method
