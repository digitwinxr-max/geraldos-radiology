"""Generate minimal valid DICOM samples (MRI, Ultrasound, Mammography).

These are synthetic test objects — real DICOM files uploaded to Orthanc so the
GeraldOS pipeline stages can be populated with honest PACS data.
"""
import os
import numpy as np
import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import generate_uid

OUT = os.path.dirname(os.path.abspath(__file__))

SOP_CLASS = "1.2.840.10008.5.1.4.1.1.4"  # MR Image Storage
US_SOP = "1.2.840.10008.5.1.4.1.1.6.1"   # Ultrasound Image Storage
MG_SOP = "1.2.840.10008.5.1.4.1.1.1.2"   # Digital Mammography X-Ray Image Storage

def make(modality, filename, sop_class, rows=128, cols=128, patient="Demo^GeraldOS"):
    uid = generate_uid()
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = sop_class
    meta.MediaStorageSOPInstanceUID = uid
    meta.TransferSyntaxUID = "1.2.840.10008.1.2.1"  # Explicit VR Little Endian
    meta.ImplementationClassUID = generate_uid()

    ds = FileDataset(filename, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = sop_class
    ds.SOPInstanceUID = uid
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.PatientName = patient
    ds.PatientID = "DEMO-001"
    ds.Modality = modality
    ds.StudyDescription = f"{modality} demo study"
    ds.SeriesDescription = f"{modality} series"
    ds.StudyDate = "20260808"
    ds.SeriesNumber = 1
    ds.InstanceNumber = 1
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
    ds.PixelData = np.full((rows, cols), 512, dtype=np.uint16).tobytes()
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.save_as(filename)
    print("wrote", filename, uid)

CT_SOP = "1.2.840.10008.5.1.4.1.1.2"   # CT Image Storage
XR_SOP = "1.2.840.10008.5.1.4.1.1.1"    # Computed Radiography Image Storage

if __name__ == "__main__":
    make("CT", os.path.join(OUT, "CT001.dcm"), CT_SOP)
    make("CT", os.path.join(OUT, "CT002.dcm"), CT_SOP)
    make("MR", os.path.join(OUT, "MRI001.dcm"), SOP_CLASS)
    make("CR", os.path.join(OUT, "XR001.dcm"), XR_SOP)
    make("US", os.path.join(OUT, "US001.dcm"), US_SOP)
    make("MG", os.path.join(OUT, "MG001.dcm"), MG_SOP, rows=256, cols=256)
