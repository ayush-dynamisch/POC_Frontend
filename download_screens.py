import urllib.request
import os

screens = [
    {
        "id": "1_login",
        "title": "MediVerify Login",
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzM3YzJmNTY2NThlNTRiMTZiN2Y0NGE4MzE3NzMxYzA2EgsSBxDVhpffsQoYAZIBIwoKcHJvamVjdF9pZBIVQhM0NzcwMjg4MTIyMzcxMzQ3MzU5&filename=&opi=96797242"
    },
    {
        "id": "2_dashboard",
        "title": "MediVerify Compliance Dashboard",
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzQwZTkyMjQ4MTM4MTRkYWE4MDJjNTE2NWE5YmQzM2YyEgsSBxDVhpffsQoYAZIBIwoKcHJvamVjdF9pZBIVQhM0NzcwMjg4MTIyMzcxMzQ3MzU5&filename=&opi=96797242"
    },
    {
        "id": "3_chat",
        "title": "MediVerify AI Compliance Chat",
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAzZmIxZjk1YTBlZjRjNmFhMDQzOWRlNzA4ZDk5NzY1EgsSBxDVhpffsQoYAZIBIwoKcHJvamVjdF9pZBIVQhM0NzcwMjg4MTIyMzcxMzQ3MzU5&filename=&opi=96797242"
    },
    {
        "id": "4_documents",
        "title": "MediVerify Documents & Review Queue",
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2IzODczNDJkMTE5NDRiMjVhNzMwY2I1NTQ1MzRhNzA1EgsSBxDVhpffsQoYAZIBIwoKcHJvamVjdF9pZBIVQhM0NzcwMjg4MTIyMzcxMzQ3MzU5&filename=&opi=96797242"
    },
    {
        "id": "5_clinician_status",
        "title": "Sandra Okafor - Compliance Status",
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2EwNDIwN2EzMjNmNzQ0OTZiZTljZDc1NTcxN2ZlNjE5EgsSBxDVhpffsQoYAZIBIwoKcHJvamVjdF9pZBIVQhM0NzcwMjg4MTIyMzcxMzQ3MzU5&filename=&opi=96797242"
    },
    {
        "id": "6_reports",
        "title": "MediVerify Reports & Approval Gate",
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzM4ZDgwMzUxNTgzZjRhZjhhMTVlODkzZTMxNWQ2NDlkEgsSBxDVhpffsQoYAZIBIwoKcHJvamVjdF9pZBIVQhM0NzcwMjg4MTIyMzcxMzQ3MzU5&filename=&opi=96797242"
    },
    {
        "id": "7_onboard_org",
        "title": "Onboard New Organization (Super Admin)",
        "url": "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sX2M0N2IxZDM3YTNmMzQxZWZiODc2NTM2ZTY0MDMyNDIyEgsSBxDVhpffsQoYAZIBIwoKcHJvamVjdF9pZBIVQhM0NzcwMjg4MTIyMzcxMzQ3MzU5&filename=&opi=96797242"
    }
]

ref_dir = os.path.join(os.path.dirname(__file__), "reference_screens")
os.makedirs(ref_dir, exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

for s in screens:
    out_path = os.path.join(ref_dir, f"{s['id']}.html")
    print(f"Downloading {s['title']} -> {out_path}...")
    req = urllib.request.Request(s["url"], headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            with open(out_path, "wb") as f:
                f.write(content)
            print(f"Downloaded: {len(content)} bytes")
    except Exception as e:
        print(f"Error {s['id']}: {e}")

print("All downloads finished!")
