"""Generate named, multi-slice DICOM samples that match the GeraldOS workflow.

Each sample uses a real Setswana patient name (DICOM PatientName = Last^First),
a distinct StudyInstanceUID per study, and multiple instances per series so the
OHIF viewer can scroll / play cine. The modality strings match the seed's
MODALITY_MAP (CT, MR, CR, US, MG).
"""
import os
import numpy as np
import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import generate_uid

OUT = os.path.dirname(os.path.abspath(__file__))

SOP_CLASSES = {
    "CT": "1.2.840.10008.5.1.4.1.1.2",     # CT Image Storage
    "MR": "1.2.840.10008.5.1.4.1.1.4",     # MR Image Storage
    "CR": "1.2.840.10008.5.1.4.1.1.1",     # Computed Radiography
    "US": "1.2.840.10008.5.1.4.1.1.6.1",   # Ultrasound Image Storage
    "MG": "1.2.840.10008.5.1.4.1.1.1.2",   # Digital Mammography
}

# (modality, filename, patient "Last^First", patient ID, study desc, series desc, slices)
SAMPLES = [
    ("CT", "CT001.dcm", "Molefe^Kagiso", "GH-100001", "CT Brain", "CT Brain axial", 40),
    ("CT", "CT002.dcm", "Kgosi^Thato", "GH-100003", "CT Chest", "CT Chest axial", 40),
    ("CT", "CT003.dcm", "Tau^Kelebogile", "GH-100008", "CT Abdomen & Pelvis", "CT Abdomen axial", 40),
    ("MR", "MRI001.dcm", "Seretse^Boitumelo", "GH-100002", "MRI Knee", "MRI Knee sagittal", 30),
    ("MR", "MRI002.dcm", "Ramotswe^Tebogo", "GH-100005", "MRI Lumbar Spine", "MRI Lumbar axial", 30),
    ("CR", "XR001.dcm", "Moeng^Neo", "GH-100006", "Chest X-Ray", "Chest PA", 2),
    ("US", "US001.dcm", "Khama^Tshepo", "GH-100007", "Abdominal Ultrasound", "Abdomen cine", 16),
    ("MG", "MG001.dcm", "Modise^Onalenna", "GH-100004", "Screening Mammogram", "CC view", 2),
]

def make_series(modality, filename, patient, patient_id, study_desc, series_desc, n_slices, rows=256, cols=256):
    study_uid = generate_uid()
    series_uid = generate_uid()
    sop_class = SOP_CLASSES[modality]
    written = []
    stem, ext = os.path.splitext(filename)
    for i in range(1, n_slices + 1):
        uid = generate_uid()
        out_name = f"{stem}_{i:03d}{ext}"
        meta = FileMetaDataset()
        meta.MediaStorageSOPClassUID = sop_class
        meta.MediaStorageSOPInstanceUID = uid
        meta.TransferSyntaxUID = "1.2.840.10008.1.2.1"  # Explicit VR Little Endian
        meta.ImplementationClassUID = generate_uid()

        ds = FileDataset(out_name, {}, file_meta=meta, preamble=b"\0" * 128)
        ds.SOPClassUID = sop_class
        ds.SOPInstanceUID = uid
        ds.StudyInstanceUID = study_uid
        ds.SeriesInstanceUID = series_uid
        ds.PatientName = patient
        ds.PatientID = patient_id
        ds.Modality = modality
        ds.StudyDescription = study_desc
        ds.SeriesDescription = series_desc
        ds.StudyDate = "20260808"
        ds.SeriesNumber = 1
        ds.InstanceNumber = i
        ds.Rows = rows
        ds.Columns = cols
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 0
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.SliceThickness = "5"
        ds.PixelSpacing = [0.5, 0.5]
        # A soft gradient with a brighter "finding" blob that shifts per slice so
        # scrolling/cine shows visible motion and W/L has something to work with.
        px = np.full((rows, cols), 300, dtype=np.uint16)
        yy, xx = np.mgrid[0:rows, 0:cols]
        ramp = ((yy / rows) * 900).astype(np.uint16)
        px = np.maximum(px, ramp)
        cx, cy = cols // 2 + (i % 7 - 3) * 4, rows // 2
        blob = ((xx - cx) ** 2 + (yy - cy) ** 2) < (18 + (i % 3) * 3) ** 2
        px[blob] = np.clip(px[blob] + 1400, 0, 65535).astype(np.uint16)
        ds.PixelData = px.tobytes()
        ds.is_little_endian = True
        ds.is_implicit_VR = False
        ds.save_as(out_name)
        written.append(out_name)
    print(f"wrote {stem}_{1:03d}{ext} .. {stem}_{n_slices:03d}{ext} ({modality}, {n_slices} slices, {patient}) study={study_uid}")

if __name__ == "__main__":
    for (mod, fn, patient, pid, sdesc, serdesc, n) in SAMPLES:
        make_series(mod, os.path.join(OUT, fn), patient, pid, sdesc, serdesc, n)
