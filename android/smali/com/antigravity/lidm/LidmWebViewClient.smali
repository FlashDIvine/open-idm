.class public Lcom/antigravity/lidm/LidmWebViewClient;
.super Landroid/webkit/WebViewClient;
.source "LidmWebViewClient.java"

.field private final activity:Lcom/antigravity/lidm/MainActivity;

.method public constructor <init>(Lcom/antigravity/lidm/MainActivity;)V
    .registers 2
    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V
    iput-object p1, p0, Lcom/antigravity/lidm/LidmWebViewClient;->activity:Lcom/antigravity/lidm/MainActivity;
    return-void
.end method

.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .registers 4
    const/4 v0, 0x0
    return v0
.end method

.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Z
    .registers 4
    const/4 v0, 0x0
    return v0
.end method
