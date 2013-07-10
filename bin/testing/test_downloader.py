import logging
from datetime import datetime, timedelta
from tawhiri.wind import Dataset
from tawhiri.wind.download import DatasetDownloader

directory = "datasets"
ds_time = datetime(2013, 7, 10, 6, 0, 0)

log_filename = Dataset.filename(directory, ds_time, suffix='.log')
log_file = open(log_filename, "w")

root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)

fmtr = logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s")

handler = logging.StreamHandler() # stderr
handler.setLevel(logging.INFO)
handler.setFormatter(fmtr)
root_logger.addHandler(handler)

handler = logging.StreamHandler(log_file)
handler.setLevel(logging.DEBUG)
handler.setFormatter(fmtr)
root_logger.addHandler(handler)


logging.info("Opened logfile %s (truncate and write)", log_filename)

logging.info("Initialising")
d = DatasetDownloader("datasets", ds_time)

logging.info("Downloading")
d.download()

logging.info("Closing")
d.close()

logging.info("Done")
