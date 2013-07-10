import textwrap
from tawhiri.wind import Dataset


sizes = ''.join("[{0}]".format(i) for i in Dataset.shape)
print "typedef double dataset_array_t{0};".format(sizes)

def dump_array(elements, name, dtype):
    if 'char' in dtype:
        data = ', '.join('"{0}"'.format(x) for x in elements)
    else:
        data = ', '.join(str(x) for x in elements)
    if not dtype.endswith('*'):
        dtype += ' '
    start = "const {0}{1}[] =".format(dtype, name)
    prepend = " " * len(start);
    lines = textwrap.wrap(data, width=70)
    lines[0] = "   { " + lines[0]
    lines[1:] = ["     " + l for l in lines[1:]]
    lines[-1] += " };"
    print start
    print "\n".join(lines)

dump_array(Dataset.shape, 'shape', 'int')
print "const int dimensions = {0};".format(len(Dataset.shape))

for index, name in enumerate(Dataset.axes._fields):
    if index == 3 or index == 4:
        dtype = 'double'
    elif index == 2:
        dtype = 'char *'
    else:
        dtype = 'int'
    dump_array(Dataset.axes[index], 'axis_{0}_{1}'.format(index, name), dtype=dtype)
