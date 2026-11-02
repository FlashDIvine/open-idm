.class public Lcom/antigravity/lidm/LidmWebChromeClient;
.super Landroid/webkit/WebChromeClient;
.source "LidmWebChromeClient.java"

.field private final activity:Lcom/antigravity/lidm/MainActivity;

.method public constructor <init>(Lcom/antigravity/lidm/MainActivity;)V
    .registers 2
    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V
    iput-object p1, p0, Lcom/antigravity/lidm/LidmWebChromeClient;->activity:Lcom/antigravity/lidm/MainActivity;
    return-void
.end method
